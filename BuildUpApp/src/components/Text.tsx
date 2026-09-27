// 한글 줄바꿈 보정 Text
//
// 안드로이드는 한글을 글자 단위로 줄바꿈해서 "볼 수 있\n어요"처럼 단어가 잘린다.
// 한글 단어 안의 글자 사이에 보이지 않는 WORD JOINER(U+2060)를 넣어
// 띄어쓰기 위치에서만 줄이 바뀌게 한다. (iOS의 lineBreakStrategy="hangul-word"와 같은 효과)
// 앱의 모든 화면은 react-native의 Text 대신 이 Text를 쓴다.
import React from 'react';
import { Text as RNText, TextProps } from 'react-native';

const WJ = '⁠';
const HANGUL = /[ㄱ-ㆎ가-힣]/;

// 공백·줄바꿈은 그대로 두고, 한글이 들어간 단어만 글자 사이를 붙인다
export function keepWords(s: string) {
  return s
    .split(/(\s+)/)
    .map(w => (HANGUL.test(w) ? Array.from(w).join(WJ) : w))
    .join('');
}

const fix = (children: React.ReactNode): React.ReactNode =>
  typeof children === 'string'
    ? keepWords(children)
    : Array.isArray(children)
    ? children.map(c => (typeof c === 'string' ? keepWords(c) : c))
    : children;

export const Text = React.forwardRef<
  React.ComponentRef<typeof RNText>,
  TextProps
>(({ children, ...rest }, ref) => (
  <RNText ref={ref} {...rest}>
    {fix(children)}
  </RNText>
));

Text.displayName = 'Text';
