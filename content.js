chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.command === "extractData") {

    // 1. Get body text, but try to restrict to a visible modal
    // This prevents background listings from polluting the modal's data.
    let bodyText = document.body.innerText;
    try {
      // Find element in center of viewport
      let centerEl = document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2);
      let curr = centerEl;
      let highestZEl = null;
      let maxZ = 0;

      while (curr && curr !== document.body && curr !== document.documentElement) {
        let style = window.getComputedStyle(curr);
        let z = parseInt(style.zIndex, 10);
        if (!isNaN(z) && z > maxZ && (style.position === 'fixed' || style.position === 'absolute' || style.position === 'sticky')) {
          maxZ = z;
          highestZEl = curr;
        }
        curr = curr.parentNode;
      }

      // If we found a modal-like container with enough text, use it instead
      if (highestZEl && highestZEl.innerText && highestZEl.innerText.trim().length > 50) {
        bodyText = highestZEl.innerText;
      }
    } catch (e) {
      console.error("Modal detection failed", e);
    }

    // Create an object to hold our extracted parsed values
    const data = {};

    // defaultManwon: true면 단위(만/억/천)가 없을 때 자동으로 ×10000 처리
    function parseValue(valStr, defaultManwon) {
      if (!valStr) return null;
      let cln = valStr.replace(/[^0-9\.]/g, '');
      if (!cln) return null;

      let num = parseFloat(cln) || 0;
      let finalVal = 0;

      if (valStr.includes('억')) {
        let eok = valStr.match(/([0-9\.]+)억/);
        let man = valStr.match(/([0-9\.]+)만/);
        let total = 0;
        if (eok) total += parseFloat(eok[1]) * 100000000;
        if (man) total += parseFloat(man[1]) * 10000;
        finalVal = total > 0 ? total : num * 100000000;
      } else if (valStr.includes('만원') || valStr.includes('만')) {
        // '만원' 또는 '만' 단위: ×10000
        finalVal = num * 10000;
      } else if (valStr.includes('천')) {
        finalVal = num * 1000;
      } else {
        // 단위가 없는 경우: defaultManwon이면 만원(×10000) 적용
        finalVal = defaultManwon ? num * 10000 : num;
      }

      // 최종 값이 1,000원~9,999원 사이인 경우 (천원 단위로 파싱된 것으로 판단하여 자동으로 천만원 단위(x10000)로 보정)
      if (finalVal >= 1000 && finalVal <= 9999) {
        finalVal = finalVal * 10000;
      }
      return finalVal;
    }

    // Tries a specific set of keywords. Stops at first successful parse.
    function extract(regexes) {
      for (let reg of regexes) {
        let match = bodyText.match(reg);
        if (match && match[1]) {
          let val = parseValue(match[1], false);
          if (val !== null) return val;
        }
      }
      return null;
    }

    // 단위가 없으면 만원(×10000)으로 자동 변환하는 추출 함수
    // 보증금, 권리금, 조제료, 비급여조제료, 일일 매약매출, 한달 평균 약제비용
    function extractManwon(regexes) {
      for (let reg of regexes) {
        let match = bodyText.match(reg);
        if (match && match[1]) {
          let val = parseValue(match[1], true);
          if (val !== null) return val;
        }
      }
      return null;
    }

    function buildReg(keywords) {
      const kw = keywords.join('|');
      // \(?[^)]*\)? 로 괄호 안 텍스트 허용 (예: 조제료(월), 일반매출(일))
      return new RegExp(`(?:${kw})(?:\\([^)]*\\))?[\\s:\\-\\t\\n]*([0-9,\\.]+(?:\\s*[만억천])?)`, 'i');
    }

    function parseAreaValue(valStr) {
      if (!valStr) return null;
      // 1. Check if the string explicitly contains a "평" value (e.g. "53.90㎡ (16.3평)", "16.3평")
      const pyeongMatch = valStr.match(/([0-9,\.]+)\s*평/);
      if (pyeongMatch && pyeongMatch[1]) {
        let val = parseFloat(pyeongMatch[1].replace(/[^0-9\.]/g, ''));
        if (val) return val;
      }
      // 2. Check if the string contains square meters (㎡, m2, m², 제곱미터)
      const hasSqMeter = valStr.includes('㎡') || valStr.includes('m2') || valStr.includes('m²') || valStr.includes('제곱미터');
      // 3. Extract the first number from the string
      const numMatch = valStr.match(/([0-9,\.]+)/);
      if (numMatch && numMatch[1]) {
        const val = parseFloat(numMatch[1].replace(/[^0-9\.]/g, ''));
        if (val) {
          if (hasSqMeter) {
            return parseFloat((val / 3.305785).toFixed(4));
          }
          // If no unit is specified, default to square meters and convert
          return parseFloat((val / 3.305785).toFixed(4));
        }
      }
      return null;
    }

    function extractArea() {
      // 1. Try table or DL structure first
      const tableVal = getValueFromTableOrDl(['전용면적', '평수', '면적', '평']);
      if (tableVal) {
        const parsed = parseAreaValue(tableVal);
        if (parsed !== null) return parsed;
      }

      // 2. Try matching from bodyText
      // 2.1. First check if '평' unit is explicitly matched in body text
      const pyeongMatch = bodyText.match(/([0-9,\.]+)\s*평/i);
      if (pyeongMatch && pyeongMatch[1]) {
        const val = parseFloat(pyeongMatch[1].replace(/[^0-9\.]/g, ''));
        if (val) return val;
      }

      // 2.2. Check keywords with optional unit (㎡, m2, m², 제곱미터, 평)
      const keywords = ['전용면적', '평수', '전용', '면적'];
      const kwPattern = keywords.join('|');
      const areaRegex = new RegExp(`(?:${kwPattern})(?:\\([^)]*\\))?[\\s:\\-\\t\\n]*([0-9,\\.]+)[\\s\\t]*(㎡|m2|m²|제곱미터|평)?`, 'i');
      
      const match = bodyText.match(areaRegex);
      if (match && match[1]) {
        const val = parseFloat(match[1].replace(/[^0-9\.]/g, ''));
        const unit = match[2] ? match[2].toLowerCase() : '';
        if (val) {
          if (unit === '평') {
            return val;
          } else {
            return parseFloat((val / 3.305785).toFixed(4));
          }
        }
      }

      // 2.3. General number followed by square meters
      const generalSqMeterRegex = /([0-9,\.]+)[\\s\\t]*(㎡|m2|m²|제곱미터)/i;
      const genMatch = bodyText.match(generalSqMeterRegex);
      if (genMatch && genMatch[1]) {
        const val = parseFloat(genMatch[1].replace(/[^0-9\.]/g, ''));
        if (val) {
          return parseFloat((val / 3.305785).toFixed(4));
        }
      }

      // 2.4. Backup keywords match without unit
      const backupRegexes = [
        buildReg(['전용면적', '평수']),
        buildReg(['전용', '면적', '평'])
      ];
      for (let reg of backupRegexes) {
        let backupMatch = bodyText.match(reg);
        if (backupMatch && backupMatch[1]) {
          let val = parseFloat(backupMatch[1].replace(/[^0-9\.]/g, ''));
          if (val) {
            const matchedContext = bodyText.substring(Math.max(0, backupMatch.index - 5), Math.min(bodyText.length, backupMatch.index + backupMatch[0].length + 10));
            if (matchedContext.includes('평')) {
              return val;
            } else {
              return parseFloat((val / 3.305785).toFixed(4));
            }
          }
        }
      }

      return null;
    }


    // ──────────────────────────────────────────
    // 금융 변수 추출용 테이블/DL 및 정적 패턴 백업 도구
    // ──────────────────────────────────────────
    function getValueFromTableOrDl(keywords) {
      // 1. Table check
      const cells = Array.from(document.querySelectorAll('th, td'));
      for (const cell of cells) {
        const text = cell.innerText.trim();
        for (const kw of keywords) {
          if (text === kw || text.replace(/\s+/g, '') === kw.replace(/\s+/g, '') || (kw.length >= 3 && text.includes(kw))) {
            const sibling = cell.nextElementSibling;
            if (sibling && (sibling.tagName.toLowerCase() === 'td' || sibling.tagName.toLowerCase() === 'th')) {
              return sibling.innerText.trim();
            }
          }
        }
      }
      // 2. Dl check
      const dts = Array.from(document.querySelectorAll('dt'));
      for (const dt of dts) {
        const text = dt.innerText.trim();
        for (const kw of keywords) {
          if (text === kw || text.replace(/\s+/g, '') === kw.replace(/\s+/g, '') || (kw.length >= 3 && text.includes(kw))) {
            const sibling = dt.nextElementSibling;
            if (sibling && sibling.tagName.toLowerCase() === 'dd') {
              return sibling.innerText.trim();
            }
          }
        }
      }
      return null;
    }

    function extractWithTableBackup(keywords, regexes, isManwon) {
      const tableVal = getValueFromTableOrDl(keywords);
      if (tableVal) {
        const parsed = parseValue(tableVal, isManwon);
        if (parsed !== null) return parsed;
      }
      if (isManwon) {
        return extractManwon(regexes);
      } else {
        return extract(regexes);
      }
    }

    // 1) 보증금 (v1) 추출
    let depositVal = getValueFromTableOrDl(['보증금']);
    if (!depositVal) {
      // '10,000 만원 / 월세 690 만원' 등 보증금 키워드가 생략되고 슬래시가 있는 형태 지원
      const depRegex = /([0-9,]+(?:\s*[만억천])?)\s*(?:만원)?\s*[\/\s]*월세\s*([0-9,]+(?:\s*[만억천])?)/i;
      const match = bodyText.match(depRegex);
      if (match && match[1]) {
        depositVal = match[1];
      }
    }
    data.v1 = depositVal ? parseValue(depositVal, true) : extractManwon([buildReg(['보증금']), buildReg(['임대료']), buildReg(['보'])]);

    // 2) 월세 (v2) 추출 후 ×1.1 부가세 적용
    let rentVal = getValueFromTableOrDl(['월세', '임차료', '차임']);
    if (!rentVal) {
      const rentRegex = /(?:[0-9,]+(?:\s*[만억천])?)\s*(?:만원)?\s*[\/\s]*월세\s*([0-9,]+(?:\s*[만억천])?)/i;
      const match = bodyText.match(rentRegex);
      if (match && match[1]) {
        rentVal = match[1];
      }
    }
    let rawV2 = rentVal ? parseValue(rentVal, false) : extract([buildReg(['임차료', '월세']), buildReg(['임차', '차임'])]);
    data.v2 = rawV2 !== null ? Math.round(rawV2 * 1.1) : null;

    // 3) 관리비 (v3) 추출
    data.v3 = extractWithTableBackup(['관리비', '주차료'], [buildReg(['관리비', '주차료'])], false);

    // 4) 권리금 (v4) 추출
    data.v4 = extractWithTableBackup(['권리금', '인테리어비', '인테리어'], [buildReg(['권리금', '인테리어']), buildReg(['권리', '권'])], true);

    // 5) 컨설팅비 (v5) 추출
    data.v5 = extractWithTableBackup(['컨설팅비', '컨설팅'], [buildReg(['컨설팅비']), buildReg(['컨비', '컨'])], false);

    // 6) 평수 (v6) 추출 (㎡ -> 평 변환 포함)
    data.v6 = extractArea();

    // 7) 월 조제료 (v7) 추출
    data.v7 = extractWithTableBackup(
      ['월평균조제료', '조제금', '조제료', '조제'],
      [
        buildReg(['월평균조제료']),
        buildReg(['조제금']),
        /(?<!비급여\s*)조제료(?:\([^)]*\))?[\s:\-\\t\\n]*([0-9,\.]+(?:\s*[만억천])?)/i,
        /(?<!비급여\s*)조제(?:\([^)]*\))?[\s:\-\\t\\n]*([0-9,\.]+(?:\s*[만억천])?)/i,
        /(?<!비급여\s*)조(?:\([^)]*\))?[\s:\-\\t\\n]*([0-9,\.]+(?:\s*[만억천])?)/i
      ],
      true
    );

    // 8) 비급여 조제료 (v8) 추출
    data.v8 = extractWithTableBackup(['비급여조제료', '비급여 조제료'], [buildReg(['비급여 조제료'])], true);

    // 9) 비급여 마진 (v9) 추출
    data.v9 = extractWithTableBackup(['비급여 약가마진', '알값 마진', '백마진', '알값'], [buildReg(['비급여 약가마진', '알값 마진', '백마진', '알값'])], false);

    // 10) 일평균 일반매출 (v10) 추출
    data.v10 = extractWithTableBackup(
      ['매출액(일반약)', '일평균일반약매출', '일일매약매출', '일반약매출', '일반매출', '일매출', '일매', '일반'],
      [
        buildReg(['일평균일반약매출']),
        buildReg(['일일매약매출']),
        buildReg(['일반약매출']),
        buildReg(['일반매출']),
        buildReg(['일매출']),
        buildReg(['일매', '일반'])
      ],
      true
    );

    // 11) 월 일반매출 (v11) 추출
    data.v11 = extractWithTableBackup(['월일반약매출', '월매출', '월매', '월일반약'], [buildReg(['월일반약매출', '월매출', '월매'])], false);

    // 12) 마진율 (v12) 추출
    data.v12 = extractWithTableBackup(['마진률', '마진율', '마진'], [buildReg(['마진률', '마진율', '마진'])], false);

    // 13) 영업일 (v13) 추출
    let days = extractWithTableBackup(['영업일수', '영업일'], [buildReg(['영업일'])], false);
    if (days === 365) days = 30;
    data.v13 = days;

    // 14) 약제비 (v14) 추출
    data.v14 = extractWithTableBackup(['약제비', '약가', '약제비용'], [buildReg(['약제비'])], true);

    // ──────────────────────────────────────────
    // 신규 파싱 필드 (사이트별 독립 파싱 시스템 구축)
    // ──────────────────────────────────────────
    const site = request.site || 'pharmple';

    // 1) dl/dt/dd 구조 파싱 헬퍼 함수
    function getValueFromDlStructure(labelText) {
      const dts = Array.from(document.querySelectorAll('dt'));
      for (const dt of dts) {
        const text = dt.innerText.trim();
        if (text === labelText || text.replace(/\s+/g, '') === labelText.replace(/\s+/g, '')) {
          const sibling = dt.nextElementSibling;
          if (sibling && sibling.tagName.toLowerCase() === 'dd') {
            return sibling.innerText.trim();
          }
        }
      }
      return null;
    }

    // 2) th/td 구조 파싱 헬퍼 함수 (데일리팜 등 테이블 레이아웃 대응)
    function getValueFromTableStructure(labelText) {
      const cells = Array.from(document.querySelectorAll('th, td'));
      for (const cell of cells) {
        const text = cell.innerText.trim();
        if (text === labelText || text.replace(/\s+/g, '') === labelText.replace(/\s+/g, '')) {
          const sibling = cell.nextElementSibling;
          if (sibling && (sibling.tagName.toLowerCase() === 'td' || sibling.tagName.toLowerCase() === 'th')) {
            return sibling.innerText.trim();
          }
        }
      }
      return null;
    }

    // 3) 스마트 라인/텍스트 검색 헬퍼 함수 (DOM 구조가 없거나 다를 때 대비)
    function getValueFromLines(labelKeywords) {
      const lines = document.body.innerText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        for (const kw of labelKeywords) {
          if (line.includes(kw)) {
            // 1) 같은 라인에 값 확인
            const regex = new RegExp(`^.*${kw}\\s*[:\\-\\s\\t]*([^\\n]+)$`);
            const match = line.match(regex);
            if (match && match[1]) {
              const suffix = match[1].trim();
              if (suffix.length >= 1 && suffix.length <= 40) {
                return suffix;
              }
            }
            // 2) 다음 라인에 값 확인 (아래로 최대 2줄까지 탐색)
            for (let k = i + 1; k <= Math.min(lines.length - 1, i + 2); k++) {
              const nextLine = lines[k];
              if (nextLine.length >= 1 && 
                  nextLine.length <= 45 &&
                  !nextLine.includes('대표') && 
                  !nextLine.includes('담당') && 
                  !nextLine.includes('전화') && 
                  !nextLine.includes('번호') &&
                  !nextLine.includes('등록') &&
                  !nextLine.includes('주소') &&
                  !nextLine.includes('시간') &&
                  !nextLine.includes('일자') &&
                  !nextLine.includes('게시')) {
                return nextLine;
              }
            }
          }
        }
      }
      return null;
    }

    // 4) 최종 백업용 전역 정규식 매칭
    function extractString(regexes, textStr) {
      for (let reg of regexes) {
        let match = textStr.match(reg);
        if (match && match[1]) {
          return match[1].trim();
        }
      }
      return null;
    }

    // 5) 전화번호 클리너 및 가독성 포맷 적용
    function cleanPhone(val) {
      if (!val) return null;
      let cln = val.replace(/[^0-9\-]/g, '').trim();
      if (cln && !cln.includes('-')) {
        if (cln.startsWith('010') && cln.length === 11) {
          cln = cln.replace(/(\d{3})(\d{4})(\d{4})/, '$1-$2-$3');
        } else if (cln.startsWith('02') && cln.length === 9) {
          cln = cln.replace(/(\d{2})(\d{3})(\d{4})/, '$1-$2-$3');
        } else if (cln.startsWith('02') && cln.length === 10) {
          cln = cln.replace(/(\d{2})(\d{4})(\d{4})/, '$1-$2-$3');
        } else if (cln.length === 10) {
          cln = cln.replace(/(\d{3})(\d{3})(\d{4})/, '$1-$2-$3');
        } else if (cln.length === 11) {
          cln = cln.replace(/(\d{3})(\d{4})(\d{4})/, '$1-$2-$3');
        }
      }
      return cln;
    }

    // 6) 약국 게시글 제목 추출
    function getPharmacyTitle() {
      const selectors = [
        'h3.view_head_tit',
        '.view_head_tit',
        'h3.property-detail-page__container__grid__left__top__title',
        '.property-detail-page__container__grid__left__top__title',
        '.view-title',
        '.detail-title',
        '.tit.flex p',
        '.tit p',
        '.tit'
      ];
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el && el.innerText.trim()) {
          const txt = el.innerText.trim();
          if (txt && 
              !txt.includes('유의사항') && !txt.includes('주의사항') && !txt.includes('신고') && 
              !txt.includes('동의') && !txt.includes('안내') && !txt.includes('로그인') && 
              !txt.includes('메뉴') && !txt.includes('검색')) {
            return txt;
          }
        }
      }

      // 백업: main 내 또는 전체 중 적절한 크기의 헤더 태그 추출 (메뉴 등 탐색 방지)
      const headers = Array.from(document.querySelectorAll('h1, h2, h3, h4'));
      for (const el of headers) {
        if (el.closest('header') || el.closest('nav') || el.closest('#header') || el.closest('#nav') || el.closest('.menu') || el.closest('.navigation')) {
          continue;
        }
        const txt = el.innerText.trim();
        if (txt && txt.length > 3 && txt.length < 80 && 
            !txt.includes('로그인') && !txt.includes('메뉴') && !txt.includes('검색') &&
            !txt.includes('매물정보') && !txt.includes('상세내역') && !txt.includes('약국임대') &&
            !txt.includes('상세설명') && !txt.includes('안내') && !txt.includes('목록') &&
            !txt.includes('등록') && !txt.includes('DP부동산') && !txt.includes('약국매물') &&
            !txt.includes('병원매물') && !txt.includes('매물의뢰') && !txt.includes('고객센터') &&
            !txt.includes('마이페이지') && !txt.includes('유의사항') && !txt.includes('주의사항')) {
          return txt;
        }
      }
      return null;
    }

    // 7) 중개인 카드 정보 추출 통합
    function extractBrokerCardInfo() {
      // 업체명
      let companyName = null;
      const storeNameEl = document.querySelector('.store-name, .broker-name, .company-name, .office-title, h3.property-detail-page__sidebar__real-estate-office__header__title, .property-detail-page__sidebar__real-estate-office__header__title, .card-title, .broker-info h3, .agent-info h3');
      if (storeNameEl) {
        companyName = storeNameEl.innerText.trim();
      }
      // 데일리팜 '약사 직거래' 등의 문구가 카드 상단에 단독 존재 시
      if (!companyName) {
        const directTransEl = Array.from(document.querySelectorAll('div, p, span, h3, h4')).find(el => {
          const txt = el.innerText.trim();
          return txt === '약사 직거래' || txt === '약사직거래';
        });
        if (directTransEl) {
          companyName = '약사 직거래';
        }
      }

      if (companyName) {
        companyName = companyName.replace(/업체\s*매물보기\s*>?/g, '').replace(/>/g, '').replace(/\s+/g, ' ').trim();
      }

      // 업체명 텍스트 라인 분석 백업
      if (!companyName) {
        const lines = document.body.innerText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        for (let i = 0; i < lines.length; i++) {
          if ((lines[i].includes('대표자') || lines[i].includes('등록자') || lines[i].includes('담당자')) && !lines[i].includes('번호') && !lines[i].includes('전화')) {
            for (let j = i - 1; j >= Math.max(0, i - 4); j--) {
              const prev = lines[j];
              if (prev && 
                  prev.length > 1 && 
                  prev.length < 40 &&
                  (prev.includes('컨설팅') || prev.includes('중개') || prev.includes('사무소') || prev.includes('부동산') || prev.includes('개발') || prev.includes('법인') || prev.includes('에이스') || prev.includes('예담') || prev.includes('직거래'))) {
                companyName = prev;
                break;
              }
            }
            if (!companyName && i > 0) {
              const immediatePrev = lines[i - 1];
              if (immediatePrev && 
                  immediatePrev.length > 1 && 
                  immediatePrev.length < 40 &&
                  !immediatePrev.includes('대표') &&
                  !immediatePrev.includes('담당') &&
                  !immediatePrev.includes('전화') &&
                  !immediatePrev.includes('번호') &&
                  !immediatePrev.includes('등록') &&
                  !immediatePrev.includes('주소')) {
                companyName = immediatePrev;
              }
            }
            break;
          }
        }
      }

      // 대표자 / 담당자 / 등록자
      let rep = getValueFromDlStructure('대표자/담당자') || getValueFromDlStructure('대표자') || getValueFromDlStructure('등록자') || getValueFromDlStructure('담당자') ||
                getValueFromTableStructure('대표자/담당자') || getValueFromTableStructure('대표자') || getValueFromTableStructure('등록자') || getValueFromTableStructure('담당자') ||
                getValueFromLines(['대표자/담당자', '대표자', '등록자', '담당자']);
      if (!rep) {
        rep = extractString([/(?:대표자\/담당자|대표자|등록자|담당자)\s*[:\-\s\t]*([가-힣a-zA-Z\s]+)/], document.body.innerText);
      }
      if (rep) rep = rep.replace(/\s+/g, '').trim();

      // 연락처
      let mainPhone = getValueFromDlStructure('대표전화') || getValueFromDlStructure('대표번호') || getValueFromDlStructure('전화번호') ||
                      getValueFromTableStructure('대표전화') || getValueFromTableStructure('대표번호') || getValueFromTableStructure('전화번호') ||
                      getValueFromLines(['대표전화', '대표번호', '전화번호', '연락처']);

      let mobilePhone = getValueFromDlStructure('휴대전화') || getValueFromDlStructure('휴대폰') || getValueFromDlStructure('담당자 번호') || getValueFromDlStructure('담당자번호') || getValueFromDlStructure('연락처') ||
                        getValueFromTableStructure('휴대전화') || getValueFromTableStructure('휴대폰') || getValueFromTableStructure('연락처') ||
                        getValueFromLines(['휴대전화', '휴대폰', '담당자 번호', '담당자번호', '연락처']);

      const fullText = document.body.innerText;
      if (!mainPhone) {
        mainPhone = extractString([/(?:대표전화|대표번호|전화번호)\s*[:\-\s\t]*([0-9\-]+)/], fullText);
      }
      if (!mobilePhone) {
        mobilePhone = extractString([/(?:휴대전화|휴대폰|담당자\s*번호|담당자번호)\s*[:\-\s\t]*([0-9\-]+)/], fullText);
      }

      mainPhone = cleanPhone(mainPhone);
      mobilePhone = cleanPhone(mobilePhone);

      // 교차 상호 보완
      if (!mobilePhone && mainPhone) {
        mobilePhone = mainPhone;
      }
      if (!mainPhone && mobilePhone) {
        mainPhone = mobilePhone;
      }

      data.company_name = companyName;
      data.representative = rep || null;
      data.main_phone = mainPhone;
      data.mobile_phone = mobilePhone;
    }

    // ──────────────────────────────────────────
    // 사이트별 파싱 함수 정의 (통합 헬퍼 호출)
    // ──────────────────────────────────────────

    function extractPharmall() {
      data.pharmacy_name = getPharmacyTitle();
      extractBrokerCardInfo();
    }

    function extractPharmple() {
      data.pharmacy_name = getPharmacyTitle();
      extractBrokerCardInfo();
    }

    function extractDailypharm() {
      data.pharmacy_name = getPharmacyTitle();
      extractBrokerCardInfo();
    }

    // ──────────────────────────────────────────
    // 분기 실행 및 결과 전송
    // ──────────────────────────────────────────
    if (site === 'pharmall') {
      extractPharmall();
    } else if (site === 'pharmple') {
      extractPharmple();
    } else if (site === 'dailypharm') {
      extractDailypharm();
    } else {
      extractPharmple(); // 기본값
    }

    sendResponse({ data: data });
  }
});
