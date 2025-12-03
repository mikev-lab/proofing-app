import http.server
import socketserver
import os
import sys

PORT = 8080
DIRECTORY = "website/out"

class CleanUrlHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def do_GET(self):
        # Try to serve the exact path
        path = self.translate_path(self.path)

        # If path is a directory, let the parent class handle it (index.html lookup)
        if os.path.isdir(path):
            super().do_GET()
            return

        # If path doesn't exist, try appending .html
        if not os.path.exists(path):
            html_path = path + ".html"
            if os.path.exists(html_path):
                self.path += ".html"

        super().do_GET()

if __name__ == "__main__":
    with socketserver.TCPServer(("", PORT), CleanUrlHandler) as httpd:
        print(f"Serving {DIRECTORY} at http://localhost:{PORT}")
        httpd.serve_forever()
