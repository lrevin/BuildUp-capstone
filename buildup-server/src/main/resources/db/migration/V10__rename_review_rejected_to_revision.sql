-- 보고 검토의 '보완 요청' 상태 이름을 앱·서버 API와 맞춘다: REJECTED → REVISION
-- (API로는 소문자 pending / approved / revision 으로 주고받는다)

UPDATE reports
SET review_status = 'REVISION'
WHERE review_status = 'REJECTED';

UPDATE report_review_events
SET status = 'REVISION'
WHERE status = 'REJECTED';
