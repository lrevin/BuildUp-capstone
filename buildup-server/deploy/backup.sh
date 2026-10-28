#!/bin/bash

set -euo pipefail

cd /opt/buildup

# -----------------------------
# BuildUp RDS Backup
# -----------------------------

ENV_FILE="/etc/buildup/buildup.env"
BACKUP_DIR="/opt/buildup/backups"
S3_BUCKET="buildup-report-storage-2026"
S3_PREFIX="backups/db"
RETENTION_DAYS=14

DATE=$(date +"%Y-%m-%d_%H-%M-%S")
BACKUP_FILE="$BACKUP_DIR/buildup-$DATE.sql.gz"

# 환경변수 불러오기
if [ ! -f "$ENV_FILE" ]; then
    echo "[ERROR] 환경변수 파일이 없습니다: $ENV_FILE"
    exit 1
fi

DB_URL=$(grep '^DB_URL=' "$ENV_FILE" | cut -d= -f2-)
DB_USERNAME=$(grep '^DB_USERNAME=' "$ENV_FILE" | cut -d= -f2-)
DB_PASSWORD=$(grep '^DB_PASSWORD=' "$ENV_FILE" | cut -d= -f2-)

# 필요한 환경변수 확인
if [ -z "${DB_URL:-}" ] || [ -z "${DB_USERNAME:-}" ] || [ -z "${DB_PASSWORD:-}" ]; then
    echo "[ERROR] DB_URL, DB_USERNAME 또는 DB_PASSWORD가 설정되지 않았습니다."
    exit 1
fi

# JDBC URL에서 host, port, database 추출
# 예:
# jdbc:mysql://example.rds.amazonaws.com:3306/buildup?serverTimezone=Asia/Seoul

DB_CONNECTION="${DB_URL#jdbc:mysql://}"
DB_HOST_PORT="${DB_CONNECTION%%/*}"
DB_NAME_WITH_QUERY="${DB_CONNECTION#*/}"
DB_NAME="${DB_NAME_WITH_QUERY%%\?*}"

DB_HOST="${DB_HOST_PORT%%:*}"

if [[ "$DB_HOST_PORT" == *":"* ]]; then
    DB_PORT="${DB_HOST_PORT##*:}"
else
    DB_PORT="3306"
fi

mkdir -p "$BACKUP_DIR"

echo "[$(date)] BuildUp DB 백업 시작"
echo "DB: $DB_HOST:$DB_PORT/$DB_NAME"

# DB 백업 + gzip 압축
mysqldump \
    --host="$DB_HOST" \
    --port="$DB_PORT" \
    --user="$DB_USERNAME" \
    --password="$DB_PASSWORD" \
    --single-transaction \
    --quick \
    --no-tablespaces \
    --routines \
    --triggers \
    "$DB_NAME" \
    | gzip > "$BACKUP_FILE"

echo "[$(date)] 로컬 백업 생성 완료: $BACKUP_FILE"

# S3 업로드
aws s3 cp \
    "$BACKUP_FILE" \
    "s3://$S3_BUCKET/$S3_PREFIX/"

echo "[$(date)] S3 업로드 완료"

# EC2 로컬 백업 14일 초과 삭제
find "$BACKUP_DIR" \
    -type f \
    -name "buildup-*.sql.gz" \
    -mtime +$RETENTION_DAYS \
    -delete

# S3에서도 14일 초과된 DB 백업 삭제
CUTOFF_DATE=$(date -d "-$RETENTION_DAYS days" +%s)

aws s3api list-objects-v2 \
    --bucket "$S3_BUCKET" \
    --prefix "$S3_PREFIX/" \
    --query 'Contents[].{Key:Key,LastModified:LastModified}' \
    --output text |
while read -r KEY LAST_MODIFIED; do
    [ -z "$KEY" ] && continue

    OBJECT_DATE=$(date -d "$LAST_MODIFIED" +%s)

    if [ "$OBJECT_DATE" -lt "$CUTOFF_DATE" ]; then
        echo "[$(date)] 오래된 S3 백업 삭제: $KEY"
        aws s3 rm "s3://$S3_BUCKET/$KEY"
    fi
done

echo "[$(date)] BuildUp DB 백업 완료"
