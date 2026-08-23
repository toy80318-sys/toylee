// 제안서 파일 고르기 - 여러 번 눌러도 앞서 고른 파일이 사라지지 않게 모아 둔다.
// 보내기 전에 프로그램(검은 창)이 살아 있는지 확인한다.
// 꺼져 있으면 브라우저의 '연결을 거부했습니다' 대신 안내를 띄우고, 입력한 내용을 지키다.
(function () {
  const form = document.querySelector("form.card");
  if (!form) return;
  const button = form.querySelector("button.primary");

  function notice(text) {
    let box = document.getElementById("offline-notice");
    if (!box) {
      box = document.createElement("p");
      box.id = "offline-notice";
      box.className = "offline";
      form.querySelector(".actions").before(box);
    }
    box.textContent = text;
  }

  form.addEventListener("submit", (e) => {
    if (form.dataset.checked === "1") return;    // 확인을 마친 뒤의 실제 전송
    e.preventDefault();
    button.disabled = true;
    const restore = () => { button.disabled = false; };
    fetch("ping", { cache: "no-store" })
      .then((r) => {
        if (!r.ok) throw new Error("bad");
        form.dataset.checked = "1";
        form.submit();
      })
      .catch(() => {
        restore();
        notice("프로그램이 꺼져 있습니다. 바탕화면 아이콘(또는 실행하기)을 다시 실행한 뒤, "
               + "이 버튼을 한 번 더 눌러 주세요. 입력하신 내용은 그대로 남아 있습니다.");
      });
  });
})();

(function () {
  const input = document.getElementById("proposal-input");
  const list = document.getElementById("file-list");
  const count = document.getElementById("file-count");
  const pick = document.getElementById("pick-files");
  const zone = document.getElementById("dropzone");
  if (!input || !list || !count || !pick || !zone) return;

  // DataTransfer 를 못 쓰는 오래된 브라우저에서는 기본 동작(한 번에 여러 장 선택)만 남긴다.
  let supported = true;
  try {
    new DataTransfer();
  } catch (e) {
    supported = false;
  }
  if (!supported) {
    count.textContent = "여러 장이면 Ctrl 또는 Shift 를 누른 채 한꺼번에 골라 주세요.";
    return;
  }

  let files = [];
  const keyOf = (f) => f.name + "|" + f.size + "|" + (f.lastModified || 0);

  function human(bytes) {
    if (bytes >= 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + "MB";
    return Math.max(1, Math.round(bytes / 1024)) + "KB";
  }

  function sync() {
    const dt = new DataTransfer();
    files.forEach((f) => dt.items.add(f));
    input.files = dt.files;

    list.innerHTML = "";
    files.forEach((f, i) => {
      const li = document.createElement("li");
      const name = document.createElement("span");
      name.className = "fname";
      name.textContent = f.name;
      const size = document.createElement("span");
      size.className = "fsize";
      size.textContent = human(f.size);
      const del = document.createElement("button");
      del.type = "button";
      del.className = "ghost small";
      del.textContent = "빼기";
      del.addEventListener("click", () => {
        files.splice(i, 1);
        sync();
      });
      li.append(name, size, del);
      list.appendChild(li);
    });

    if (!files.length) {
      count.textContent = "아직 고른 파일이 없습니다.";
      return;
    }
    const total = files.reduce((sum, f) => sum + f.size, 0);
    count.textContent = `파일 ${files.length}개 (합계 ${human(total)})`;
  }

  function add(incoming) {
    const seen = new Set(files.map(keyOf));
    Array.from(incoming).forEach((f) => {
      if (seen.has(keyOf(f))) return;   // 같은 파일을 두 번 고른 경우
      seen.add(keyOf(f));
      files.push(f);
    });
    sync();
  }

  pick.addEventListener("click", () => input.click());

  input.addEventListener("change", () => {
    // 새로 고른 것만 더한다(브라우저는 고를 때마다 목록을 통째로 바꿔 버린다).
    const picked = Array.from(input.files);
    add(picked);
  });

  ["dragenter", "dragover"].forEach((ev) =>
    zone.addEventListener(ev, (e) => {
      e.preventDefault();
      zone.classList.add("over");
    }));
  ["dragleave", "drop"].forEach((ev) =>
    zone.addEventListener(ev, (e) => {
      e.preventDefault();
      zone.classList.remove("over");
    }));
  zone.addEventListener("drop", (e) => {
    if (e.dataTransfer && e.dataTransfer.files) add(e.dataTransfer.files);
  });

  // 뒤로 가기로 돌아오면 브라우저가 고른 파일을 되살려 주므로, 목록도 그대로 맞춰 준다.
  if (input.files && input.files.length) files = Array.from(input.files);
  sync();
  window.addEventListener("pageshow", () => {
    if (!files.length && input.files && input.files.length) {
      files = Array.from(input.files);
      sync();
    }
  });
})();
