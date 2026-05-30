import datetime
import uuid
from sqlalchemy import Column, String, Integer, Numeric, DateTime, JSON
from .database import Base

class Project(Base):
    __tablename__ = "projects"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String, nullable=False)
    version = Column(Integer, nullable=False, default=1)
    units = Column(String, nullable=False, default="mm")
    graph = Column(JSON, nullable=False, default=dict)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

class Sortament(Base):
    __tablename__ = "sortament"

    ref = Column(String, primary_key=True)
    shape = Column(String, nullable=False)  # 'round' | 'rectangular'
    d = Column(Numeric, nullable=True)      # круглый, мм
    w = Column(Numeric, nullable=True)      # прямоугольный, мм
    h = Column(Numeric, nullable=True)      # прямоугольный, мм
    wall_thickness = Column(Numeric, nullable=True)
    mass_per_m = Column(Numeric, nullable=True)
    source = Column(String, nullable=True)
