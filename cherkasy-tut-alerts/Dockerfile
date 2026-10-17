FROM python:3.12-slim
WORKDIR /app
COPY bot.py launcher.py ./
COPY tests ./tests
RUN python -m unittest discover -s tests -v
ENV PYTHONUNBUFFERED=1
CMD ["python", "-u", "launcher.py"]
