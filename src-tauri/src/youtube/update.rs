//! Keeps the yt-dlp sidecar current. YouTube breaks old extractors every few
//! weeks and only the nightly channel keeps up, so the sidecar updates itself
//! in place (`--update-to nightly@latest`): once at startup and, throttled to
//! [`RECHECK_INTERVAL`], before every yt-dlp run. Every run goes through
//! [`ensure_fresh`], which also serializes spawns behind an in-flight update —
//! the binary is being replaced under them.
//!
//! Best-effort throughout: an update that fails (offline, a read-only install
//! dir such as `/usr/bin`) is logged and the caller proceeds with the sidecar
//! it has.

use std::time::{Duration, Instant};

use tauri::{AppHandle, Manager, Runtime};
use tauri_plugin_shell::process::CommandEvent;
use tauri_plugin_shell::ShellExt;

use super::{kill_sidecar_tree, proxy_args, SIDECAR_YTDLP};

/// The channel the bundled binary is built from — see `release.yml`.
const UPDATE_TARGET: &str = "nightly@latest";
/// Downloading a ~15 MB binary through a slow proxy takes a while; a wedged
/// update must still not hold every download hostage.
const UPDATE_TIMEOUT: Duration = Duration::from_secs(120);
/// Between checks triggered by downloads/resolves. Startup always checks.
const RECHECK_INTERVAL: Duration = Duration::from_secs(60 * 60);

/// Managed state: when the sidecar was last checked. The lock is held for
/// the whole update so concurrent callers wait for the new binary.
#[derive(Default)]
pub struct YtDlpUpdater(tokio::sync::Mutex<Option<Instant>>);

/// What `--update-to` reported.
#[derive(Debug, PartialEq, Eq)]
enum UpdateOutcome {
    Updated(String),
    UpToDate(String),
    Failed(String),
}

/// Reads yt-dlp's own update report. Its last relevant line is one of
/// `Updated yt-dlp to <version> from <repo>`, `yt-dlp is up to date (<version>
/// from <repo>)` or an `ERROR:` line; anything else is treated as a failure
/// with the raw text attached.
fn parse_update_output(stdout: &str, stderr: &str) -> UpdateOutcome {
    for line in stdout.lines().rev().map(str::trim) {
        if let Some(rest) = line.strip_prefix("Updated yt-dlp to ") {
            return UpdateOutcome::Updated(rest.to_owned());
        }
        if let Some(rest) = line.strip_prefix("yt-dlp is up to date (") {
            return UpdateOutcome::UpToDate(rest.trim_end_matches(')').to_owned());
        }
    }
    let detail = stderr
        .lines()
        .chain(stdout.lines())
        .map(str::trim)
        .rfind(|line| line.starts_with("ERROR"))
        .unwrap_or_else(|| stderr.trim())
        .to_owned();
    UpdateOutcome::Failed(if detail.is_empty() {
        "no update report from yt-dlp".to_owned()
    } else {
        detail
    })
}

async fn run_update<R: Runtime>(app: &AppHandle<R>) -> UpdateOutcome {
    let mut args: Vec<String> = vec!["--update-to".into(), UPDATE_TARGET.into()];
    args.extend(proxy_args(app));

    let spawned = app
        .shell()
        .sidecar(SIDECAR_YTDLP)
        .and_then(|cmd| cmd.args(args).spawn());
    let (mut rx, child) = match spawned {
        Ok(spawned) => spawned,
        Err(e) => return UpdateOutcome::Failed(format!("spawn failed: {e}")),
    };

    let collected = tokio::time::timeout(UPDATE_TIMEOUT, async {
        let mut stdout = String::new();
        let mut stderr = String::new();
        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(bytes) => {
                    stdout.push_str(&String::from_utf8_lossy(&bytes));
                    stdout.push('\n');
                }
                CommandEvent::Stderr(bytes) => {
                    stderr.push_str(&String::from_utf8_lossy(&bytes));
                    stderr.push('\n');
                }
                _ => {}
            }
        }
        (stdout, stderr)
    })
    .await;

    match collected {
        Ok((stdout, stderr)) => parse_update_output(&stdout, &stderr),
        Err(_) => {
            kill_sidecar_tree(child);
            UpdateOutcome::Failed(format!("timed out after {}s", UPDATE_TIMEOUT.as_secs()))
        }
    }
}

/// Updates the sidecar unless it was checked less than `max_age` ago
/// (`None` = always). Waits for an update another caller has in flight, so
/// a sidecar spawned right after this call sees a consistent binary.
pub(crate) async fn ensure_fresh<R: Runtime>(app: &AppHandle<R>, max_age: Option<Duration>) {
    let updater = app.state::<YtDlpUpdater>();
    let mut last = updater.0.lock().await;
    if let (Some(max_age), Some(checked)) = (max_age, *last) {
        if checked.elapsed() < max_age {
            return;
        }
    }

    match run_update(app).await {
        UpdateOutcome::Updated(version) => log::info!("yt-dlp updated to {version}"),
        UpdateOutcome::UpToDate(version) => log::debug!("yt-dlp is up to date ({version})"),
        UpdateOutcome::Failed(detail) => log::warn!("yt-dlp update failed: {detail}"),
    }
    // A failed check is not retried until the interval passes either — an
    // offline session must not re-run the update before every track.
    *last = Some(Instant::now());
}

/// The throttled variant every yt-dlp run goes through.
pub(crate) async fn ensure_fresh_throttled<R: Runtime>(app: &AppHandle<R>) {
    ensure_fresh(app, Some(RECHECK_INTERVAL)).await;
}

#[cfg(test)]
mod tests {
    use super::{parse_update_output, UpdateOutcome};

    #[test]
    fn reads_an_update_report() {
        let stdout = "Current version: nightly@2026.08.18.122307 from yt-dlp/yt-dlp-nightly-builds\n\
                      Latest version: nightly@2026.08.20.234504 from yt-dlp/yt-dlp-nightly-builds\n\
                      Updating to nightly@2026.08.20.234504 from yt-dlp/yt-dlp-nightly-builds ...\n\
                      Updated yt-dlp to nightly@2026.08.20.234504 from yt-dlp/yt-dlp-nightly-builds\n";

        assert_eq!(
            parse_update_output(stdout, ""),
            UpdateOutcome::Updated(
                "nightly@2026.08.20.234504 from yt-dlp/yt-dlp-nightly-builds".into()
            )
        );
    }

    #[test]
    fn reads_an_up_to_date_report() {
        let stdout = "Latest version: nightly@2026.08.20.234504 from yt-dlp/yt-dlp-nightly-builds\n\
                      yt-dlp is up to date (nightly@2026.08.20.234504 from yt-dlp/yt-dlp-nightly-builds)\n";

        assert_eq!(
            parse_update_output(stdout, ""),
            UpdateOutcome::UpToDate(
                "nightly@2026.08.20.234504 from yt-dlp/yt-dlp-nightly-builds".into()
            )
        );
    }

    #[test]
    fn surfaces_the_error_line_or_the_raw_stderr() {
        assert_eq!(
            parse_update_output("", "ERROR: Unable to overwrite current version\n"),
            UpdateOutcome::Failed("ERROR: Unable to overwrite current version".into())
        );
        assert_eq!(
            parse_update_output("", ""),
            UpdateOutcome::Failed("no update report from yt-dlp".into())
        );
    }
}
