from sqlalchemy import create_engine, Column, String, Text, ForeignKey, TIMESTAMP, func
from sqlalchemy.dialects.postgresql import UUID, ARRAY, JSONB
from sqlalchemy.orm import declarative_base, relationship, sessionmaker
import uuid

Base = declarative_base()

class Word(Base):
    __tablename__ = 'words'
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_word = Column(Text, nullable=False)
    lemma = Column(Text, nullable=False)
    syllabification = Column(Text)
    part_of_speech = Column(Text)
    user_context_sentence = Column(Text)
    contextual_meaning_en = Column(Text)
    contextual_meaning_zh = Column(Text)
    other_common_meanings = Column(ARRAY(Text))
    image_differentiation_zh = Column(Text)
    original_yaml = Column(JSONB)
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    # Relationships
    etymology = relationship("Etymology", uselist=False, back_populates="word", cascade="all, delete-orphan")
    cognates = relationship("Cognate", back_populates="word", cascade="all, delete-orphan")
    examples = relationship("Example", back_populates="word", cascade="all, delete-orphan")
    synonyms = relationship("Synonym", back_populates="word", cascade="all, delete-orphan")

class Etymology(Base):
    __tablename__ = 'etymologies'
    
    word_id = Column(UUID(as_uuid=True), ForeignKey('words.id', ondelete='CASCADE'), primary_key=True)
    prefix = Column(Text)
    root = Column(Text)
    suffix = Column(Text)
    structure_analysis = Column(Text)
    history_myth = Column(Text)
    source_word = Column(Text)
    pie_root = Column(Text)
    visual_imagery_zh = Column(Text)
    meaning_evolution_zh = Column(Text)

    word = relationship("Word", back_populates="etymology")

class Cognate(Base):
    __tablename__ = 'cognates'
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    word_id = Column(UUID(as_uuid=True), ForeignKey('words.id', ondelete='CASCADE'), nullable=False)
    cognate_word = Column(Text, nullable=False)
    logic = Column(Text, nullable=False)

    word = relationship("Word", back_populates="cognates")

class Example(Base):
    __tablename__ = 'examples'
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    word_id = Column(UUID(as_uuid=True), ForeignKey('words.id', ondelete='CASCADE'), nullable=False)
    example_type = Column(Text)
    sentence = Column(Text, nullable=False)
    translation_zh = Column(Text)

    word = relationship("Word", back_populates="examples")

class Synonym(Base):
    __tablename__ = 'synonyms'
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    word_id = Column(UUID(as_uuid=True), ForeignKey('words.id', ondelete='CASCADE'), nullable=False)
    synonym_word = Column(Text, nullable=False)
    meaning_zh = Column(Text)

    word = relationship("Word", back_populates="synonyms")
