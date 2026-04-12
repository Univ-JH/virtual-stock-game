/**
 * @file firebase-config.js
 * @description Firebase 앱 초기화 및 공통 서비스 인스턴스를 제공하는 모듈입니다.
 *
 * [리팩토링 배경]
 * 초기 개발 시 script.js, overseas.js, ranking.js 세 파일에 동일한 firebaseConfig 객체와
 * initializeApp() 호출이 중복으로 존재했습니다. 설정 변경 시 세 곳을 모두 수정해야 하는
 * 유지보수 문제를 해결하기 위해 단일 진입점 모듈로 분리하였습니다.
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";
import { getFunctions } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-functions.js";

const firebaseConfig = {
    apiKey: "AIzaSyAmerULdPVcySQ-B86H0XAy8queWItkiws",
    authDomain: "virtual-stock-game.firebaseapp.com",
    projectId: "virtual-stock-game",
    storageBucket: "virtual-stock-game.firebasestorage.app",
    messagingSenderId: "211036941511",
    appId: "1:211036941511:web:1e2dd77d0882314df9e2e2"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

export const functions = getFunctions(app, "asia-northeast3");
