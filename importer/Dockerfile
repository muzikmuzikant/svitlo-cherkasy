FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app

WORKDIR /app
COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r requirements.txt
COPY scripts/ /app/scripts/
COPY importer/ /app/importer/
RUN mkdir -p /app/data && addgroup --system app && adduser --system --ingroup app app && chown -R app:app /app
USER app
# 4m hard timeout: a hanging website must not keep a Railway Cron job active.
CMD ["timeout", "-k", "5s", "240s", "python", "-m", "importer.worker"]
