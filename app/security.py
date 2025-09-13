import os
from cryptography.fernet import Fernet

# It's crucial that this key is set in your environment variables and kept secret.
# You can generate a key using:
# python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
ENCRYPTION_KEY = os.environ.get("ENCRYPTION_KEY")

if not ENCRYPTION_KEY:
    raise ValueError("No ENCRYPTION_KEY set for Flask application")

f = Fernet(ENCRYPTION_KEY.encode())

def encrypt_password(password: str) -> str:
    """Encrypts a password."""
    if not password:
        return ""
    return f.encrypt(password.encode()).decode()

def decrypt_password(encrypted_password: str) -> str:
    """Decrypts a password."""
    if not encrypted_password:
        return ""
    return f.decrypt(encrypted_password.encode()).decode()
