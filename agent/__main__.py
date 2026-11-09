import argparse
import webbrowser

from .config import Config
from .server import make_server


def main():
    parser = argparse.ArgumentParser(description="Run the personal Opportunity Desk service.")
    parser.add_argument("--open", action="store_true", help="Open the dashboard in the default browser.")
    args = parser.parse_args()
    config = Config.from_env()
    server = make_server(config)
    url = f"http://127.0.0.1:{server.server_address[1]}"
    print(f"Opportunity Desk is running at {url}", flush=True)
    print("Keep this process running. Press Ctrl+C to stop.", flush=True)
    if args.open:
        webbrowser.open(url)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
