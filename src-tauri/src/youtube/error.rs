//! Structured error type returned by YouTube commands so the frontend can
//! branch on the failure class instead of parsing message strings.

/// Failure class, serialized as SCREAMING_SNAKE_CASE for the frontend.
#[derive(Debug, Clone, Copy, serde::Serialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum YtErrorKind {
    /// The requested video/playlist/album/artist does not exist.
    NotFound,
    /// Content exists but cannot be served (geoblocked, premium, private, …).
    Unavailable,
    /// Transport-level failure (offline, proxy down, HTTP 5xx).
    Network,
    /// Malformed input (bad id, empty query).
    InvalidInput,
    /// The operation was cancelled by the user.
    Cancelled,
    Unknown,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct YtError {
    pub kind: YtErrorKind,
    pub message: String,
}

impl YtError {
    pub fn new(kind: YtErrorKind, message: impl Into<String>) -> Self {
        Self { kind, message: message.into() }
    }

    pub fn unknown(message: impl Into<String>) -> Self {
        Self::new(YtErrorKind::Unknown, message)
    }

    pub fn invalid_input(message: impl Into<String>) -> Self {
        Self::new(YtErrorKind::InvalidInput, message)
    }

    pub fn cancelled(message: impl Into<String>) -> Self {
        Self::new(YtErrorKind::Cancelled, message)
    }
}

impl std::fmt::Display for YtError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.message)
    }
}

impl From<rustypipe::error::Error> for YtError {
    fn from(e: rustypipe::error::Error) -> Self {
        use rustypipe::error::{Error, ExtractionError};
        let kind = match &e {
            Error::Extraction(ExtractionError::NotFound { .. }) => YtErrorKind::NotFound,
            Error::Extraction(ExtractionError::Unavailable { .. }) => YtErrorKind::Unavailable,
            Error::Extraction(ExtractionError::BadRequest(_)) => YtErrorKind::InvalidInput,
            Error::Http(_) | Error::HttpStatus(..) => YtErrorKind::Network,
            _ => YtErrorKind::Unknown,
        };
        Self::new(kind, e.to_string())
    }
}

/// Legacy string errors from internal helpers (yt-dlp invocations, fs, …).
impl From<String> for YtError {
    fn from(message: String) -> Self {
        Self::unknown(message)
    }
}
