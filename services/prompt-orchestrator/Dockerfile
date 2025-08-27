FROM python:3.11-slim

WORKDIR /app

COPY ../shared/requirements.txt /app/shared_requirements.txt
RUN pip install -r shared_requirements.txt

COPY ../shared /app/shared
ENV PYTHONPATH="/app:${PYTHONPATH}"

COPY . /app/

EXPOSE 8001

CMD ["python", "main.py"]
