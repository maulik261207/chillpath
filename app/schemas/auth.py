from uuid import UUID

from pydantic import BaseModel, EmailStr, Field


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=12)
    organization_name: str = Field(min_length=1, max_length=200)
    organization_slug: str = Field(pattern=r"^[a-z0-9-]+$")


class UserResponse(BaseModel):
    id: UUID
    email: EmailStr


class RegisterResponse(BaseModel):
    user: UserResponse
    organization_id: UUID
    role: str


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    organization_id: UUID | None = None
    organization_name: str | None = None

