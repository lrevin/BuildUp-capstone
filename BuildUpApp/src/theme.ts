// Build Up 공통 디자인 값
// 원칙: 바탕은 밝게, 남색은 글자색으로, 노란색은 주요 버튼·오늘 작업분에만.
export const colors = {
  // 브랜드
  navy: '#121722', // 진한 글자, 누적 막대
  yellow: '#F9B51D', // 주요 버튼, 오늘 작업분
  yellowSoft: '#FEF6E0', // 노란 강조의 옅은 배경

  // 글자
  text: '#121722',
  textSub: '#6B7080',
  textMuted: '#7D8594', // 흐린 글자(흰 바탕에서도 읽히는 밝기)
  gray: '#6B7080', // (이전 이름 호환)

  // 면
  background: '#F2F4F7', // 화면 바탕
  white: '#FFFFFF', // 카드·상단바
  fill: '#F3F4F6', // 칩·세그먼트 바탕
  border: '#E4E7EC',
  divider: '#F0F1F3',
  track: '#ECEEF1', // 진행률 막대 바탕

  danger: '#E5484D',
  success: '#1F9D55',

  // 로그인·회원가입 바탕(웹 대시보드와 같은 색)
  ink950: '#0D1118', // 화면 바탕
  ink900: '#121823', // 상단바
  ink800: '#1B2330', // 테두리·구분선
  ink400: '#8792A2', // 어두운 바탕 위 보조 글자
};

export const radius = { sm: 10, md: 14, lg: 20 };

// 카드·상자에 쓰는 아주 옅은 그림자(떠 있는 느낌만)
export const shadow = {
  shadowColor: '#1B2333',
  shadowOpacity: 0.06,
  shadowRadius: 12,
  shadowOffset: { width: 0, height: 4 },
  elevation: 2,
};

// 여백 규칙: 화면 좌우·카드 안쪽은 모두 gutter(20)로 맞춘다
export const space = { gutter: 20, cardGap: 12 };

export const font = {
  title: { fontSize: 22, fontWeight: '700' as const, color: colors.text },
  heading: { fontSize: 17, fontWeight: '700' as const, color: colors.text },
  body: { fontSize: 15, color: colors.text },
  sub: { fontSize: 13, color: colors.textSub },
  caption: { fontSize: 12, color: colors.textMuted },
};
