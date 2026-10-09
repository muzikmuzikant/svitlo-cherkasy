"""On Windows: pip install -r requirements.txt && python local_server.py
Web site on http://localhost:8000; the background worker checks news every 30m
and official address PDF list on startup and every seven days.
"""
import http.server
import logging
import threading
import time
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

import requests
from scripts.update_data import update_schedules,update_addresses

ROOT=Path(__file__).resolve().parent

def worker():
    logger=logging.getLogger('svitlo-server')
    session=requests.Session()
    last_pdf=0
    while True:
        try:
            data=update_schedules(session)
            logger.info('Отримано графіки: %s',', '.join(d['date'] for d in data['days']))
        except Exception:logger.exception('Не вдалося оновити графіки. Повторимо через 30 хвилин.')
        if not last_pdf or time.time()-last_pdf>7*86400:
            try:
                index=update_addresses(session)
                logger.info('Перелік адрес завантажено: %s записів',len(index['keys']))
                last_pdf=time.time()
            except Exception:logger.exception('Не вдалося оновити перелік адрес; повторимо наступного разу.')
        time.sleep(1800)

if __name__=='__main__':
    logging.basicConfig(level=logging.INFO,format='%(asctime)s %(levelname)s %(message)s')
    threading.Thread(target=worker,daemon=True).start()
    import functools
    handler=functools.partial(http.server.SimpleHTTPRequestHandler,directory=str(ROOT))
    server=http.server.ThreadingHTTPServer(('127.0.0.1',8000),handler)
    print('СВІТЛО ЧЕРКАСИ → http://localhost:8000')
    print('Тримайте це вікно відкритим для автоматичного оновлення.')
    server.serve_forever()
