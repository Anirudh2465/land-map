from typing import Optional
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql+psycopg2://lpms_user:lpms_password@db:5432/lpms"
    SECRET_KEY: str = "supersecretkey_change_in_production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 1 week for dev

    # Admin seed
    ADMIN_PASSWORD: str = "Admin@1234"

    # Supabase Configuration
    SUPABASE_URL: str = ""
    SUPABASE_SERVICE_ROLE_KEY: str = ""
    SUPABASE_STORAGE_BUCKET: str = "geospatial"
    SUPABASE_PUBLISHABLE_KEY: str = ""

    # AI Configuration
    GEMINI_API_KEY: str = ""

    # Mapbox
    MAPBOX_ACCESS_TOKEN: Optional[str] = ""

    model_config = SettingsConfigDict(
        env_file=(".env", "../.env"),
        extra="ignore"
    )


settings = Settings()
