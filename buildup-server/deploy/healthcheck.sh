#!/bin/sh
# 1분마다 서버가 응답하는지 보고, 3번 연속(3분) 응답이 없으면 다시 켠다.
# 프로세스 종료는 buildup.service의 Restart=on-failure가 우선 처리한다.
# 등록: /etc/cron.d/buildup-healthcheck에서 1분마다 root 권한으로 실행
URL=http://127.0.0.1:8080/api/health
FAIL_FILE=/opt/buildup/.health-fail

# 재시작 제한에 걸려 failed 상태가 되면 제한을 초기화하고 다시 시작한다.
if systemctl is-failed --quiet buildup; then
  echo "$(date '+%F %T') 서비스 failed 상태 감지, 재시작 시도"
  rm -f "$FAIL_FILE"
  systemctl reset-failed buildup

  if systemctl start buildup; then
    echo "$(date '+%F %T') 서비스 시작 요청 완료"
    exit 0
  fi

  echo "$(date '+%F %T') 서비스 시작 실패" >&2
  exit 1
fi

# 유지보수를 위해 관리자가 중지한 inactive 상태는 다시 켜지 않는다.
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
