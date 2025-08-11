import os
import sys

def get_app_data_path(filename):

    # Determine the base path, works for frozen executables
    if getattr(sys, 'frozen', False):
        base_path = os.path.dirname(sys.executable)
    else:
        base_path = os.path.dirname(os.path.abspath(__file__))

    data_dir = os.path.join(base_path, "app_data")

    # Create the data directory if it doesn't exist
    if not os.path.exists(data_dir):
        try:
            os.makedirs(data_dir)
        except OSError as e:
            print(f"Error creating data directory: {e}")
            # Fallback to current directory if creation fails
            return filename
            
    return os.path.join(data_dir, filename)
