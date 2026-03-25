"""
SQLAlchemy 2.0 persistence layer — SQLite (default) or PostgreSQL.
Full schema: users, pipelines, pipeline_logs, research_sessions.
Deployment stage included in pipeline stages JSON.
"""
import json
import logging
import os
from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Any, Dict, Generator, List, Optional

from sqlalchemy import (
    Boolean, Column, DateTime, Float, ForeignKey,
    Index, Integer, String, Text, create_engine, event,
)
from sqlalchemy.orm import DeclarativeBase, Session, relationship, sessionmaker

logger = logging.getLogger(__name__)

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./autodev_guardian.db")

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False} if "sqlite" in DATABASE_URL else {},
    echo=False,
    pool_pre_ping=True,
)

if "sqlite" in DATABASE_URL:
    @event.listens_for(engine, "connect")
    def set_sqlite_pragma(dbapi_conn, _record):
        cur = dbapi_conn.cursor()
        cur.execute("PRAGMA journal_mode=WAL")
        cur.execute("PRAGMA foreign_keys=ON")
        cur.close()

SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)


class Base(DeclarativeBase):
    pass


class UserModel(Base):
    __tablename__ = "users"
    id = Column(String(36), primary_key=True)
    username = Column(String(64), unique=True, nullable=False, index=True)
    email = Column(String(255), unique=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), nullable=False)
    last_login = Column(DateTime(timezone=True), nullable=True)
    pipelines = relationship("PipelineModel", back_populates="owner", lazy="select")


class PipelineModel(Base):
    __tablename__ = "pipelines"
    id = Column(String(8), primary_key=True)
    feature_request = Column(Text, nullable=False)
    gitlab_issue_id = Column(String(64), nullable=True)
    status = Column(String(32), nullable=False, default="initializing")
    stages_json = Column(Text, nullable=False, default="{}")
    artifacts_json = Column(Text, nullable=False, default="{}")
    owner_id = Column(String(36), ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False)
    updated_at = Column(DateTime(timezone=True), nullable=False)

    owner = relationship("UserModel", back_populates="pipelines")
    logs = relationship("PipelineLogModel", back_populates="pipeline",
                        lazy="select", cascade="all, delete-orphan")
    research_sessions = relationship("ResearchSessionModel", back_populates="pipeline",
                                     lazy="select", cascade="all, delete-orphan")

    __table_args__ = (
        Index("ix_pipelines_status", "status"),
        Index("ix_pipelines_created_at", "created_at"),
    )

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "feature_request": self.feature_request,
            "gitlab_issue_id": self.gitlab_issue_id,
            "status": self.status,
            "stages": json.loads(self.stages_json),
            "artifacts": json.loads(self.artifacts_json),
            "owner_id": self.owner_id,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


class PipelineLogModel(Base):
    __tablename__ = "pipeline_logs"
    id = Column(Integer, primary_key=True, autoincrement=True)
    pipeline_id = Column(String(8), ForeignKey("pipelines.id"), nullable=False)
    timestamp = Column(DateTime(timezone=True), nullable=False)
    agent = Column(String(64), nullable=False)
    message = Column(Text, nullable=False)
    level = Column(String(16), nullable=False, default="info")
    pipeline = relationship("PipelineModel", back_populates="logs")
    __table_args__ = (Index("ix_pipeline_logs_pipeline_id", "pipeline_id"),)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "timestamp": self.timestamp.isoformat() if self.timestamp else None,
            "agent": self.agent, "message": self.message, "level": self.level,
        }


class ResearchSessionModel(Base):
    __tablename__ = "research_sessions"
    id = Column(String(64), primary_key=True)
    pipeline_id = Column(String(8), ForeignKey("pipelines.id"), nullable=False)
    status = Column(String(32), nullable=False, default="running")
    baseline_ms = Column(Float, nullable=True)
    best_ms = Column(Float, nullable=True)
    best_iteration = Column(Integer, nullable=False, default=0)
    iterations_json = Column(Text, nullable=False, default="[]")
    started_at = Column(DateTime(timezone=True), nullable=False)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    pipeline = relationship("PipelineModel", back_populates="research_sessions")

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id, "pipeline_id": self.pipeline_id,
            "status": self.status, "baseline_ms": self.baseline_ms,
            "best_ms": self.best_ms, "best_iteration": self.best_iteration,
            "iterations": json.loads(self.iterations_json),
            "started_at": self.started_at.isoformat() if self.started_at else None,
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
        }


def create_tables() -> None:
    Base.metadata.create_all(bind=engine)
    logger.info("DB schema verified: %s", DATABASE_URL.split("://")[0])


@contextmanager
def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


class PipelineRepository:
    @staticmethod
    def create(db: Session, pipeline_dict: Dict[str, Any]) -> PipelineModel:
        now = datetime.now(timezone.utc)
        row = PipelineModel(
            id=pipeline_dict["id"],
            feature_request=pipeline_dict["feature_request"],
            gitlab_issue_id=pipeline_dict.get("gitlab_issue_id"),
            status=pipeline_dict.get("status", "initializing"),
            stages_json=json.dumps(pipeline_dict.get("stages", {})),
            artifacts_json=json.dumps(pipeline_dict.get("artifacts", {})),
            owner_id=pipeline_dict.get("owner_id"),
            created_at=now, updated_at=now,
        )
        db.add(row)
        db.flush()
        return row

    @staticmethod
    def update_stage(db: Session, pid: str, stage: str,
                     status: str, artifact: Any = None) -> Optional[PipelineModel]:
        row = db.get(PipelineModel, pid)
        if not row:
            return None
        stages = json.loads(row.stages_json)
        stages[stage] = status
        row.stages_json = json.dumps(stages)
        if artifact is not None:
            arts = json.loads(row.artifacts_json)
            arts[stage] = artifact
            row.artifacts_json = json.dumps(arts)
        row.updated_at = datetime.now(timezone.utc)
        vals = list(stages.values())
        if any(v == "failed" for v in vals):
            row.status = "failed"
        elif all(v == "completed" for v in vals):
            row.status = "completed"
        elif any(v == "running" for v in vals):
            row.status = "running"
        else:
            row.status = "in_progress"
        db.flush()
        return row

    @staticmethod
    def set_status(db: Session, pid: str, status: str) -> None:
        row = db.get(PipelineModel, pid)
        if row:
            row.status = status
            row.updated_at = datetime.now(timezone.utc)
            db.flush()

    @staticmethod
    def get(db: Session, pid: str) -> Optional[Dict]:
        row = db.get(PipelineModel, pid)
        return row.to_dict() if row else None

    @staticmethod
    def list_all(db: Session) -> List[Dict]:
        rows = db.query(PipelineModel).order_by(PipelineModel.created_at.desc()).all()
        return [r.to_dict() for r in rows]

    @staticmethod
    def add_log(db: Session, pid: str, agent: str,
                message: str, level: str) -> None:
        db.add(PipelineLogModel(
            pipeline_id=pid,
            timestamp=datetime.now(timezone.utc),
            agent=agent, message=message, level=level,
        ))
        db.flush()

    @staticmethod
    def get_logs(db: Session, pid: str) -> List[Dict]:
        rows = (db.query(PipelineLogModel)
                .filter(PipelineLogModel.pipeline_id == pid)
                .order_by(PipelineLogModel.id).all())
        return [r.to_dict() for r in rows]


class ResearchRepository:
    @staticmethod
    def create(db: Session, sid: str, pid: str,
               baseline_ms: float) -> ResearchSessionModel:
        row = ResearchSessionModel(
            id=sid, pipeline_id=pid, baseline_ms=baseline_ms,
            status="running", started_at=datetime.now(timezone.utc),
        )
        db.add(row)
        db.flush()
        return row

    @staticmethod
    def add_iteration(db: Session, sid: str, iteration: Dict) -> None:
        row = db.get(ResearchSessionModel, sid)
        if not row:
            return
        iters = json.loads(row.iterations_json)
        iters.append(iteration)
        row.iterations_json = json.dumps(iters)
        times = [i["execution_time_ms"] for i in iters]
        row.best_ms = min(times)
        row.best_iteration = times.index(min(times)) + 1
        db.flush()

    @staticmethod
    def complete(db: Session, sid: str) -> None:
        row = db.get(ResearchSessionModel, sid)
        if row:
            row.status = "completed"
            row.completed_at = datetime.now(timezone.utc)
            db.flush()

    @staticmethod
    def get(db: Session, sid: str) -> Optional[Dict]:
        row = db.get(ResearchSessionModel, sid)
        return row.to_dict() if row else None

    @staticmethod
    def list_all(db: Session) -> List[Dict]:
        rows = db.query(ResearchSessionModel).order_by(
            ResearchSessionModel.started_at.desc()).all()
        return [r.to_dict() for r in rows]
