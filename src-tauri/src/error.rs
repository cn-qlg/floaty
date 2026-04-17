use serde::Serialize;
use thiserror::Error;

#[derive(Error, Debug)]
pub enum AppError {
    #[error("database error: {0}")]
    Db(#[from] sqlx::Error),
    #[error("not found")]
    NotFound,
    #[error("{0}")]
    Other(String),
}

impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

pub type AppResult<T> = Result<T, AppError>;
