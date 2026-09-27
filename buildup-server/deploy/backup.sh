#!/bin/sh
# 매일 백업: DB 전체 + 사진·첨부 폴더. 14일 지난 백업은 지운다.
# 등록(매일 새벽 3시): sudo crontab -e →  0 3 * * * /opt/buildup/backup.sh >> /opt/buildup/backup.log 2>&1
# DB 비밀번호는 /opt/buildup/.my.cnf 에 적어 둔다(권한 600):
#   [client]
#   user=buildup
#   password=DB비밀번호
set -e
BASE=/opt/buildup
DEST=$BASE/backups
DAY=$(date +%Y%m%d)
mkdir -p "$DEST"

mysqldump --defaults-extra-file=$BASE/.my.cnf --single-transaction --routines buildup | gzip > "$DEST/db-$DAY.sql.gz"
tar -czf "$DEST/uploads-$DAY.tar.gz" -C "$BASE" uploads

find "$DEST" -name '*.gz' -mtime +14 -delete
echo "$(date '+%F %T') 백업 완료"
