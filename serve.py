import http.server
import socketserver
import sys
import os

class RobustHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        # Disable aggressive caching for JS modules during development
        if self.path.endswith('.js') or self.path.endswith('.html'):
            self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
            self.send_header('Pragma', 'no-cache')
            self.send_header('Expires', '0')
        super().end_headers()

    def log_message(self, format, *args):
        try:
            sys.stdout.write("%s - - [%s] %s\n" %
                             (self.address_string(),
                              self.log_date_time_string(),
                              format % args))
            sys.stdout.flush()
        except Exception:
            pass

    def handle(self):
        try:
            super().handle()
        except (ConnectionResetError, ConnectionAbortedError, BrokenPipeError, TimeoutError, OSError):
            pass

class ThreadingServer(socketserver.ThreadingMixIn, socketserver.TCPServer):
    allow_reuse_address = True
    daemon_threads = True

if __name__ == '__main__':
    port = 3000
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    server_address = ('', port)
    with ThreadingServer(server_address, RobustHandler) as httpd:
        print(f"ACD Dashboard robust server listening on port {port}...")
        sys.stdout.flush()
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            pass
