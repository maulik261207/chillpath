import secrets

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password, verify_password
from app.db.session import get_db
from app.models.identity import Membership, MembershipRole, Organization, User
from app.schemas.auth import LoginRequest, LoginResponse, RegisterRequest, RegisterResponse, UserResponse

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=RegisterResponse, status_code=status.HTTP_201_CREATED)
async def register(payload: RegisterRequest, db: AsyncSession = Depends(get_db)) -> RegisterResponse:
    if (await db.scalar(select(User).where(User.email == payload.email.lower()))) is not None:
        raise HTTPException(status_code=409, detail="email already registered")
    if (await db.scalar(select(Organization).where(Organization.slug == payload.organization_slug))) is not None:
        raise HTTPException(status_code=409, detail="organization slug already registered")
    user = User(email=payload.email.lower(), password_hash=hash_password(payload.password))
    organization = Organization(name=payload.organization_name, slug=payload.organization_slug)
    db.add_all([user, organization])
    await db.flush()
    db.add(Membership(user_id=user.id, organization_id=organization.id, role=MembershipRole.owner))
    await db.commit()
    return RegisterResponse(user=UserResponse(id=user.id, email=user.email), organization_id=organization.id, role="owner")


@router.post("/login", response_model=LoginResponse)
async def login(payload: LoginRequest, db: AsyncSession = Depends(get_db)) -> LoginResponse:
    user = await db.scalar(select(User).where(User.email == payload.email.lower()))
    if user is None or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="invalid credentials")
    organization = await db.scalar(
        select(Organization)
        .join(Membership, Membership.organization_id == Organization.id)
        .where(Membership.user_id == user.id, Membership.status == "active", Organization.status == "active")
        .order_by(Membership.joined_at.asc())
        .limit(1)
    )
    # Session persistence is deliberately deferred to the session store milestone.
    return LoginResponse(
        access_token=secrets.token_urlsafe(32),
        organization_id=organization.id if organization else None,
        organization_name=organization.name if organization else None,
    )

