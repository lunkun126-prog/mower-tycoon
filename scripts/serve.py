"""割草大亨本地服务（launchpad 8322 用）：和 python -m http.server 一样，只是每个文件都带 no-cache，
改完代码刷新一下就是新版（以前浏览器会缓存旧 js 好几个小时，改了也看不到）。
用法：python scripts/serve.py [端口]   （工作目录 = public）"""
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class NoCache(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache')
        super().end_headers()


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8322
    ThreadingHTTPServer(('127.0.0.1', port), NoCache).serve_forever()
