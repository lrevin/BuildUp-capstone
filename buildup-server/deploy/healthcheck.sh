#!/bin/sh
# 1분마다 서버가 응답하는지 보고, 3번 연속(3분) 응답이 없으면 다시 켠다.
# (프로세스는 살아 있는데 멈춰서 응답을 안 하는 경우용. 아예 꺼지는 건 buildup.service의 Restart=always가 처리)
# 등록: sudo crontab -e →  * * * * * /opt/buildup/healthcheck.sh >> /opt/buildup/healthcheck.log 2>&1
URL=http://127.0.0.1:8080/api/health
FAIL_FILE=/opt/buildup/.health-fail

if curl -fsS --max-time 10 "$URL" > /dev/null 2>&1; then
  rm -f "$FAIL_FILE"
  exit 0
fi

COUNT=$(( $(cat "$FAIL_FILE" 2>/dev/null || echo 0) + 1 ))
echo "$COUNT" > "$FAIL_FILE"
echo "$(date '+%F %T') 응답 없음 ($COUNT번째)"

if [ "$COUNT" -ge 3 ]; then
  echo "$(date '+%F %T') 서버 다시 켬"
  systemctl restart buildup
  systemctl reload nginx || systemctl restart nginx
  rm -f "$FAIL_FILE"
fi
