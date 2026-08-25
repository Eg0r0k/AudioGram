//! Navidrome (Subsonic) configuration state and the `nd/…` routes of the
//! loopback media server.
//!
//! The frontend derives `{token, salt}` from the password once per config
//! change (`nd_set_config`); the raw password never reaches Rust and the
//! token never appears in media-element URLs, DevTools or logs — upstream
//! URLs are built here and never logged.

mod config;
mod cover;
mod download;
mod prefetch;

// Glob re-exports: `generate_handler!` resolves the hidden `__cmd__*` items
// through `nd::`, which explicit re-exports would have to list by hand.
pub use config::*;
pub(crate) use cover::*;
pub use download::*;
pub(crate) use prefetch::*;
