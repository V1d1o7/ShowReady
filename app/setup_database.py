import os
import psycopg2
from psycopg2 import sql

def setup_database():
    """
    Connects to the PostgreSQL database and executes the db_structure.sql script
    to set up the database schema.
    """
    conn = None  # Initialize conn to None before the try block
    try:
        # Get database connection details from environment variables
        password = os.getenv("DB_PASSWORD")
        host = os.getenv("DB_HOST")

        # Check for required environment variables
        if not all([password, host]):
            print("Error: Please set the required environment variables: DB_HOST and DB_PASSWORD")
            print("You can also set DB_NAME, DB_USER, and DB_PORT if they differ from the Supabase defaults.")
            return
        
        # Get optional variables with Supabase defaults
        dbname = os.getenv("DB_NAME", "postgres")
        user = os.getenv("DB_USER", "postgres")
        port = os.getenv("DB_PORT", "5432")

        # Connect to the PostgreSQL server
        print("Connecting to the PostgreSQL database...")
        print(f"Host: {host}, Port: {port}, DB Name: {dbname}, User: {user}, Password: {'*' * len(password) if password else None}")
        conn = psycopg2.connect(
            dbname=dbname,
            user=user,
            password=password,
            host=host,
            port=port,
            connect_timeout=10  # Set a 10-second connection timeout
        )
        conn.autocommit = True
        cursor = conn.cursor()

        # Read the SQL script
        print("Reading db_structure.sql...")
        with open("db_structure.sql", "r") as f:
            sql_script = f.read()

        # Execute the SQL script
        print("Executing SQL script... Press Ctrl+C to interrupt.")
        cursor.execute(sql_script)

        print("Database setup completed successfully!")

    except KeyboardInterrupt:
        print("\nScript interrupted by user. Exiting.")
    except psycopg2.OperationalError as e:
        # Handle connection errors specifically
        print(f"Error: Could not connect to the database. Please check your connection details and network access.")
        print(f"Details: {e}")
    except psycopg2.Error as e:
        print(f"A database error occurred: {e}")
    except FileNotFoundError:
        print("Error: db_structure.sql not found. Make sure the file is in the same directory as this script.")
    except Exception as e:
        print(f"An unexpected error occurred: {e}")
    finally:
        if conn is not None:
            conn.close()
            print("Database connection closed.")

if __name__ == "__main__":
    from dotenv import load_dotenv
    load_dotenv()
    setup_database()