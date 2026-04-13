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

    function parseValue(valStr) {
      if (!valStr) return null;
      let cln = valStr.replace(/[^0-9\.]/g, '');
      if (!cln) return null;

      let num = parseFloat(cln) || 0;

      if (valStr.includes('억')) {
        let eok = valStr.match(/([0-9\.]+)억/);
        let man = valStr.match(/([0-9\.]+)만/);
        let total = 0;
        if (eok) total += parseFloat(eok[1]) * 100000000;
        if (man) total += parseFloat(man[1]) * 10000;
        return total > 0 ? total : num * 100000000;
      } else if (valStr.includes('만원') || valStr.includes('만')) {
        // '만원' 또는 '만' 단위: ×10000
        return num * 10000;
      } else if (valStr.includes('천')) {
        return num * 1000;
      } else {
        return num;
      }
    }

    // Tries a specific set of keywords. Stops at first successful parse.
    function extract(regexes) {
      for (let reg of regexes) {
        let match = bodyText.match(reg);
        if (match && match[1]) {
          let val = parseValue(match[1]);
          if (val !== null) return val;
        }
      }
      return null;
    }

    function buildReg(keywords) {
      const kw = keywords.join('|');
      return new RegExp(`(?:${kw})[\\s:\\-\\t\\n]*([0-9,\\.]+(?:\\s*[만억천])?)`, 'i');
    }

    // Split and order keywords by specificity!
    data.v1 = extract([buildReg(['보증금']), buildReg(['보'])]);
    data.v2 = extract([buildReg(['임차료', '월세']), buildReg(['임차', '차임'])]);
    data.v3 = extract([buildReg(['관리비', '주차료'])]);
    data.v4 = extract([buildReg(['권리금', '인테리어']), buildReg(['권리', '권'])]);
    data.v5 = extract([buildReg(['컨설팅비']), buildReg(['컨비', '컨'])]);

    data.v6 = extract([
      /([0-9,\.]+)\s*평/i,
      buildReg(['전용면적', '평수']),
      buildReg(['전용', '면적', '평'])
    ]);

    data.v8 = extract([buildReg(['비급여 조제료'])]);

    data.v7 = extract([
      buildReg(['월평균조제료']),
      /(?<!비급여\s*)조제료[\s:\-\\t\\n]*([0-9,\.]+(?:\s*[만억천])?)/i,
      /(?<!비급여\s*)조제[\s:\-\\t\\n]*([0-9,\.]+(?:\s*[만억천])?)/i,
      /(?<!비급여\s*)조[\s:\-\\t\\n]*([0-9,\.]+(?:\s*[만억천])?)/i
    ]);

    data.v9 = extract([buildReg(['비급여 약가마진', '알값 마진', '백마진', '알값'])]);

    data.v11 = extract([buildReg(['월일반약매출', '월매출', '월매'])]);
    data.v10 = extract([
      buildReg(['일평균일반약매출']),
      buildReg(['일일매약매출']),
      buildReg(['일반약매출']),
      buildReg(['일매출']),
      buildReg(['일매', '일반'])
    ]);

    data.v12 = extract([buildReg(['마진률', '마진율', '마진'])]);

    let days = extract([buildReg(['영업일'])]);
    if (days === 365) days = 30;
    data.v13 = days;

    data.v14 = extract([buildReg(['약제비'])]);

    sendResponse({ data: data });
  }
});
