import os
from cryptography.fernet import Fernet, InvalidToken

# Load the key from environment variables
ENCRYPTION_KEY = os.environ.get("ENCRYPTION_KEY")
if not ENCRYPTION_KEY:
    raise ValueError("ENCRYPTION_KEY environment variable not set.")

fernet = Fernet(ENCRYPTION_KEY.encode())

def encrypt_password(password: str) -> str:
    """Encrypts a plain-text password."""
    return fernet.encrypt(password.encode()).decode()

def decrypt_password(encrypted_password: str) -> str:
    """Decrypts an encrypted password."""
    try:
        return fernet.decrypt(encrypted_password.encode()).decode()
    except InvalidToken:
        # Handle cases where the token is invalid
        raise ValueError("Invalid encrypted data")
