// Menu toggling
const menuToggle = document.getElementById('menu-toggle');
const menu = document.getElementById('menu');
const mobileMenu = document.getElementById('mobile-menu');
const menuBtns = document.querySelectorAll('.menu-btn');
const content = document.getElementById('content');

// Mobile menu open/close
menuToggle && menuToggle.addEventListener('click', () => {
  mobileMenu.classList.toggle('hidden');
});

// Menu switching
function setActiveMenu(selected) {
  menuBtns.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.menu === selected);
  });
}
function renderContent(menu) {
  let html = '';
  if (menu === 'geral') {
    html = `
      <div class="grid gap-6 md:grid-cols-3 sm:grid-cols-2">
        <button class="feature-btn bg-gradient-to-br from-green-700 to-green-500 hover:scale-105 transition-transform font-bold rounded-xl p-8 flex flex-col items-center shadow-lg" onclick="showModal('Cores das Equipe', 'Exemplo: Azul, Vermelho, Amarelo, etc.')">
          🎨<span class="mt-3">Cores das Equipe</span>
        </button>
        <button class="feature-btn bg-gradient-to-br from-cyan-800 to-cyan-500 hover:scale-105 transition-transform font-bold rounded-xl p-8 flex flex-col items-center shadow-lg" onclick="showModal('Informações das Equipes', 'Aqui você pode colocar as informações detalhadas das equipes.')">
          📋<span class="mt-3">Informações das Equipes</span>
        </button>
        <button class="feature-btn bg-gradient-to-br from-orange-700 to-yellow-500 hover:scale-105 transition-transform font-bold rounded-xl p-8 flex flex-col items-center shadow-lg" onclick="showModal('Conectar no Zello', 'Link de conexão: <a href=\\'#\\' class=\\'underline text-blue-300\\'>Acesse o canal Zello</a>')">
          📡<span class="mt-3">Conectar no Zello</span>
        </button>
      </div>
    `;
  } else if (menu === '30' || menu === '31') {
    html = `
      <div class="grid gap-6 md:grid-cols-2">
        <button class="feature-btn bg-gradient-to-br from-purple-700 to-purple-500 hover:scale-105 transition-transform font-bold rounded-xl p-8 flex flex-col items-center shadow-lg" onclick="showModal('Controle de Acesso', 'Controle de acesso exclusivo do dia ${menu}/08. Você pode inserir detalhes aqui.')">
          🛂<span class="mt-3">Controle de Acesso</span>
        </button>
        <button class="feature-btn bg-gradient-to-br from-pink-600 to-red-500 hover:scale-105 transition-transform font-bold rounded-xl p-8 flex flex-col items-center shadow-lg" onclick="showModal('Permissão de Transitar', 'Permissões para transitar pelo evento no dia ${menu}/08.')">
          🛑<span class="mt-3">Permissão de Transitar</span>
        </button>
      </div>
    `;
  }
  content.innerHTML = html;
  // Accessibility: focus first button
  setTimeout(() => {
    const firstBtn = content.querySelector('button');
    if (firstBtn) firstBtn.focus();
  }, 100);
}

// Modal logic
window.showModal = function(title, message) {
  if (document.getElementById('modal-bg')) return;
  const modalBg = document.createElement('div');
  modalBg.id = 'modal-bg';
  modalBg.className = 'fixed inset-0 z-50 bg-black bg-opacity-60 flex items-center justify-center animate-fadeIn';
  const modal = document.createElement('div');
  modal.className = 'bg-slate-900 rounded-xl p-6 max-w-xs w-full shadow-2xl flex flex-col items-center border border-slate-700';
  modal.innerHTML = `
    <h2 class="text-xl font-bold mb-2">${title}</h2>
    <div class="mb-4 text-slate-200">${message}</div>
    <button class="mt-2 px-4 py-2 bg-gradient-to-r from-blue-900 to-cyan-700 rounded text-white hover:bg-blue-700 font-medium" onclick="closeModal()">Fechar</button>
  `;
  modalBg.appendChild(modal);
  document.body.appendChild(modalBg);
  setTimeout(() => modal.querySelector('button').focus(), 200);
};
window.closeModal = function() {
  const modal = document.getElementById('modal-bg');
  if (modal) modal.remove();
};

// Banner upload logic
const bannerImg = document.getElementById('banner-img');
const bannerUpload = document.getElementById('banner-upload');
if (bannerUpload && bannerImg) {
  bannerUpload.addEventListener('change', (e) => {
    const file = bannerUpload.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(ev) {
      bannerImg.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  });
}

// Menu event listeners
menuBtns.forEach(btn => {
  btn.addEventListener('click', e => {
    const which = btn.dataset.menu;
    setActiveMenu(which);
    renderContent(which);
    // Close mobile menu after click
    if (mobileMenu && !mobileMenu.classList.contains('hidden')) mobileMenu.classList.add('hidden');
  });
});

// On load: show "Geral"
setActiveMenu('geral');
renderContent('geral');

// Accessibility: keyboard navigation for menu
document.addEventListener('keydown', (e) => {
  if (e.key === "Escape") closeModal();
});
