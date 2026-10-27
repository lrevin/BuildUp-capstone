#!/bin/sh
# 1분마다 서버가 응답하는지 보고, 3번 연속(3분) 응답이 없으면 다시 켠다.
# 프로세스 종료는 buildup.service의 Restart=on-failure가 처리한다.
# 등록: sudo crontab -e →  * * * * * /opt/buildup/healthcheck.sh >> /opt/buildup/healthcheck.log 2>&1
URL=http://127.0.0.1:8080/api/health
FAIL_FILE=/opt/buildup/.health-fail

# 유지보수를 위해 관리자가 서비스를 중지한 경우에는 다시 켜지 않는다.
if ! systemctl is-active --quiet buildup; then
  rm -f "$FAIL_FILE"
  exit 0
fi

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
  rm -f "$FAIL_FILE"
fi
