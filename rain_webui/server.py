from __future__ import annotations

import argparse
import logging
import os
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from typing import NoReturn, Tuple, Type


logger = logging.getLogger(__name__)


def run_server(host: str = "127.0.0.1", port: int = 8000) -> NoReturn:
    base_dir = os.path.dirname(os.path.abspath(__file__))
    static_dir = os.path.join(base_dir, "static")

    HandlerClass: Type[SimpleHTTPRequestHandler] = partial(  # type: ignore[assignment]
        SimpleHTTPRequestHandler, directory=static_dir
    )  # type: ignore[call-arg]

    server_address: Tuple[str, int] = (host, port)
    httpd = ThreadingHTTPServer(server_address, HandlerClass)

    logger.info("Serving rain_webui from %s", static_dir)
    logger.info("Open http://%s:%d/ in your browser", host, port)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        logger.info("Shutting down server")
    finally:
        httpd.server_close()


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    parser = argparse.ArgumentParser(description="Simple rain animation web UI server")
    parser.add_argument("--host", default="127.0.0.1", help="Host/IP to bind (default: 127.0.0.1)")
    parser.add_argument("--port", type=int, default=8000, help="Port to bind (default: 8000)")
    args = parser.parse_args()

    run_server(host=args.host, port=args.port)


if __name__ == "__main__":
    main()

