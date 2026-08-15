//! Navidrome (Subsonic) configuration state and the nd routes of the
//! `stream://` proxy.
//!
//! The frontend derives `{token, salt}` from the password once per config
//! change (`nd_set_config`); the raw password never reaches Rust and the
//! token never appears in media-element URLs, DevTools or logs — upstream
//! URLs are built here and never logged.

mod config;
mod cover;
mod download;
mod prefetch;

// Glob re-exports keep `nd::` a drop-in for the old single file — including
// the hidden `__cmd__*` items `generate_handler!` resolves for commands.
pub use config::*;
pub(crate) use cover::*;
pub use download::*;
pub(crate) use prefetch::*;
