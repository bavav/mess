# config.py
from dotenv import load_dotenv
import os

load_dotenv()
from datetime import timedelta

class Config:
    SECRET_KEY = os.getenv("SECRET_KEY")
    SQLALCHEMY_DATABASE_URI = 'sqlite:///app.db'
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    JWT_EXPIRATION = timedelta(hours=24)
    BLOBS_FOLDER = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'static', 'blobs')
    MAX_BLOB_SIZE = 100 * 1024 * 1024  # 100 MB