// 검토 화면 - 특약 편집 / 검색 / 재분석
(function () {
  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => Array.from(el.querySelectorAll(sel));

  function collect() {
    return {
      job_id: window.JOB_ID,
      customer: {
        name: $("#c-name").value, birth: $("#c-birth").value,
        gender: $("#c-gender").value, phone: $("#c-phone").value,
        memo: $("#c-memo").value,
      },
      planner: {
        name: $("#p-name").value, phone: $("#p-phone").value, org: $("#p-org").value,
      },
      product: $("#p-product").value,
      options: {
        show_sources: $("#o-sources").checked,
        show_full_table: $("#o-fulltable").checked,
        table_only: $("#o-tableonly").checked,
        greeting: $("#o-greeting").value,
      },
      riders: $$("#riders .rider").map((el) => ({
        name: $(".r-name", el).value.trim(),
        amount: $(".r-amount", el).value.trim(),
        premium: $(".r-premium", el).value.trim(),
        period: $(".r-period", el).value.trim(),
        note: $(".r-note", el) ? $(".r-note", el).value.trim() : "",
        section_id: el.dataset.section ? Number(el.dataset.section) : null,
      })).filter((r) => r.name || r.section_id),
    };
  }

  async function post(payload) {
    const res = await fetch("/rebuild", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return res.json();
  }

  async function refresh(reload) {
    const btn = $("#btn-refresh");
    btn.disabled = true; btn.textContent = "분석 중…";
    try {
      const out = await post(collect());
      if (!out.ok) { alert("문제가 발생했습니다: " + out.error); return; }
      window.JOB_ID = out.job_id;
      $("#btn-report").href = "/report/" + out.job_id;
      if (reload) location.href = "/job/" + out.job_id;
    } finally {
      btn.disabled = false; btn.textContent = "다시 분석";
    }
  }

  document.addEventListener("click", (e) => {
    if (e.target.matches(".r-del")) {
      e.preventDefault();
      e.target.closest(".rider").remove();
    }
  });

  $("#btn-add").addEventListener("click", (e) => {
    e.preventDefault();
    const tpl = $("#tpl-rider");
    $("#riders").appendChild(tpl.content.cloneNode(true));
  });

  $("#btn-refresh").addEventListener("click", (e) => { e.preventDefault(); refresh(true); });
  $("#btn-save").addEventListener("click", async (e) => {
    e.preventDefault();
    await refresh(false);
    e.target.textContent = "저장됨 ✓";
    setTimeout(() => (e.target.textContent = "변경사항 저장"), 1500);
  });

  // 특약 검색(자동완성)
  let timer = null;
  document.addEventListener("input", (e) => {
    if (!e.target.matches(".r-search")) return;
    const box = e.target;
    const sel = $(".r-alt", box.closest(".rider"));
    clearTimeout(timer);
    timer = setTimeout(async () => {
      const q = box.value.trim();
      if (q.length < 2) return;
      const res = await fetch("/api/search?q=" + encodeURIComponent(q));
      const items = await res.json();
      sel.innerHTML = '<option value="">— 검색 결과 —</option>' +
        items.map((i) => `<option value="${i.section_id}">${i.product} · ${i.name}` +
          ` (${Math.round(i.score * 100)}%)</option>`).join("");
    }, 250);
  });

  document.addEventListener("change", (e) => {
    if (!e.target.matches(".r-alt")) return;
    const rider = e.target.closest(".rider");
    if (!e.target.value) return;
    rider.dataset.section = e.target.value;
    const label = e.target.options[e.target.selectedIndex].textContent;
    $(".r-name", rider).value = label.split("·").slice(1).join("·")
      .replace(/\s*\(\d+%\)\s*$/, "").trim();
    $(".matched", rider).innerHTML = '<span class="chip ok">' + label + "</span>";
  });
})();
