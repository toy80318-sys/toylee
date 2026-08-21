/*
 * Anthropic SDK 브라우저 번들의 입구 파일입니다.
 *   npm run vendor:sdk   →  standalone/anthropic-sdk.js  (전역 이름 AnthropicSDK)
 *
 * 계약자 관리는 파일 하나로 도는 프로그램이라 npm 의존성을 실행 시점에 쓸 수 없습니다.
 * 그래서 SDK 를 미리 한 덩어리로 묶어 standalone/ 에 넣어 두고 (xlsx-lite.js 와 같은 방식)
 * 빌드할 때 HTML 안에 그대로 넣습니다.
 */
import Anthropic from '@anthropic-ai/sdk';
export default Anthropic;
