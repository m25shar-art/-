const socket = io();

// DOM
const registerScreen = document.getElementById('registerScreen');
const chatScreen = document.getElementById('chatScreen');
const registerInput = document.getElementById('registerInput');
const registerButton = document.getElementById('registerButton');
const registerError = document.getElementById('registerError');
const messagesContainer = document.getElementById('messagesContainer');
const messageInput = document.getElementById('messageInput');
const sendButton = document.getElementById('sendButton');
const attachButton = document.getElementById('attachButton');
const fileInput = document.getElementById('fileInput');
const onlineCount = document.getElementById('onlineCount');
const typingStatus = document.getElementById('typingStatus');
const logoutButton = document.getElementById('logoutButton');
const usersList = document.getElementById('usersList');
const searchInput = document.getElementById('searchInput');

let currentUser = '';
let selectedAvatar = '👤';
let typingTimeout = null;

// ===== ВЫБОР АВАТАРА =====
document.querySelectorAll('.avatar-option').forEach(el => {
  el.addEventListener('click', () => {
    document.querySelectorAll('.avatar-option').forEach(a => a.classList.remove('selected'));
    el.classList.add('selected');
    selectedAvatar = el.dataset.avatar;
  });
});

// Выбираем первый аватар по умолчанию
document.querySelector('.avatar-option').classList.add('selected');

// ===== РЕГИСТРАЦИЯ =====
registerButton.addEventListener('click', register);
registerInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') register();
});

function register() {
  const name = registerInput.value.trim();
  if (!name) {
    registerError.textContent = '❌ Введите ваше имя';
    return;
  }
  
  currentUser = name;
  socket.emit('register', { username: name, avatar: selectedAvatar });
  registerScreen.style.display = 'none';
  chatScreen.style.display = 'flex';
  messageInput.focus();
}

// ===== СООБЩЕНИЯ =====
socket.on('history', (messages) => {
  messagesContainer.innerHTML = '';
  if (messages.length === 0) {
    messagesContainer.innerHTML = '<div class="welcome">👋 Добро пожаловать в чат!</div>';
  } else {
    messages.forEach(msg => renderMessage(msg));
  }
  scrollToBottom();
});

socket.on('newMessage', (data) => {
  const welcome = messagesContainer.querySelector('.welcome');
  if (welcome) welcome.remove();
  renderMessage(data);
  scrollToBottom();
});

// ===== ОТРИСОВКА СООБЩЕНИЯ =====
function renderMessage(data) {
  const isMine = data.username === currentUser;
  const div = document.createElement('div');
  div.className = `message ${isMine ? 'message-mine' : 'message-other'}`;

  let fileHTML = '';
  if (data.file) {
    if (data.file.type === 'image') {
      fileHTML = `
        <div class="file-container">
          <img src="${data.file.url}" alt="Изображение" loading="lazy" />
        </div>
      `;
    } else if (data.file.type === 'video') {
      fileHTML = `
        <div class="file-container">
          <video controls>
            <source src="${data.file.url}" />
          </video>
        </div>
      `;
    } else {
      const icon = getFileIcon(data.file.name);
      const size = formatFileSize(data.file.size);
      fileHTML = `
        <div class="file-container">
          <a href="${data.file.url}" target="_blank" class="file-info">
            <span class="file-icon">${icon}</span>
            <span class="file-name">${escapeHtml(data.file.name)}</span>
            <span class="file-size">${size}</span>
          </a>
        </div>
      `;
    }
  }

  div.innerHTML = `
    <div class="meta">
      <span class="msg-avatar">${data.avatar || '👤'}</span>
      <span class="username">${escapeHtml(data.username)}</span>
      <span class="time">${data.time}</span>
    </div>
    ${data.text ? `<div class="text">${escapeHtml(data.text)}</div>` : ''}
    ${fileHTML}
  `;

  messagesContainer.appendChild(div);
}

// ===== ОТПРАВКА =====
async function sendMessage() {
  const text = messageInput.value.trim();
  const files = fileInput.files;

  if (!text && files.length === 0) return;

  // Отправляем файлы
  for (const file of files) {
    const formData = new FormData();
    formData.append('file', file);
    
    try {
      const res = await fetch('/upload', { method: 'POST', body: formData });
      const data = await res.json();
      
      if (data.url) {
        socket.emit('sendMessage', {
          text: '',
          file: data
        });
      }
    } catch (err) {
      console.error('Ошибка загрузки:', err);
    }
  }

  // Отправляем текст
  if (text) {
    socket.emit('sendMessage', { text, file: null });
  }

  messageInput.value = '';
  fileInput.value = '';
  messageInput.focus();
  scrollToBottom();
}

// ===== ФАЙЛЫ =====
attachButton.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', () => {
  if (fileInput.files.length > 0) {
    sendMessage();
  }
});

// ===== ПЕЧАТАЕТ =====
messageInput.addEventListener('input', () => {
  socket.emit('typing', true);
  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => {
    socket.emit('typing', false);
  }, 1000);
});

socket.on('userTyping', ({ username, isTyping }) => {
  if (username === currentUser) return;
  typingStatus.textContent = isTyping ? `${username} печатает...` : '';
});

// ===== ПОЛЬЗОВАТЕЛИ =====
socket.on('usersList', (users) => {
  renderUsers(users);
  onlineCount.textContent = `🟢 ${users.length} в сети`;
});

socket.on('userJoined', ({ username, avatar }) => {
  if (username !== currentUser) {
    addSystemMessage(`🔵 ${username} присоединился`);
  }
});

socket.on('userLeft', (username) => {
  addSystemMessage(`🔴 ${username} покинул чат`);
});

function renderUsers(users) {
  usersList.innerHTML = '';
  users.forEach(user => {
    const div = document.createElement('div');
    div.className = 'user-item';
    if (user.username === currentUser) {
      div.classList.add('active');
    }
    div.innerHTML = `
      <div class="user-avatar">${user.avatar || '👤'}</div>
      <div class="user-info">
        <div class="user-name">${escapeHtml(user.username)}</div>
        <div class="user-status online">${user.username === currentUser ? 'Вы' : 'В сети'}</div>
      </div>
    `;
    usersList.appendChild(div);
  });
}

function addSystemMessage(text) {
  const div = document.createElement('div');
  div.style.cssText = `
    text-align: center; 
    color: #444466; 
    font-size: 12px; 
    padding: 6px 0;
    font-style: italic;
  `;
  div.textContent = text;
  messagesContainer.appendChild(div);
  scrollToBottom();
}

// ===== ПОИСК =====
searchInput.addEventListener('input', () => {
  const query = searchInput.value.toLowerCase();
  const items = usersList.querySelectorAll('.user-item');
  items.forEach(item => {
    const name = item.querySelector('.user-name').textContent.toLowerCase();
    item.style.display = name.includes(query) ? 'flex' : 'none';
  });
});

// ===== ВЫХОД =====
logoutButton.addEventListener('click', () => {
  if (confirm('Выйти из чата?')) {
    location.reload();
  }
});

// ===== СОБЫТИЯ =====
sendButton.addEventListener('click', sendMessage);
messageInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

// ===== УТИЛИТЫ =====
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function scrollToBottom() {
  setTimeout(() => {
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }, 50);
}

function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
}

function getFileIcon(filename) {
  const ext = filename.split('.').pop().toLowerCase();
  const icons = {
    pdf: '📄', doc: '📝', docx: '📝',
    txt: '📃', zip: '📦', rar: '📦',
    exe: '⚙️', apk: '📱', mp3: '🎵',
    mp4: '🎬', avi: '🎬', mov: '🎬',
    jpg: '🖼️', jpeg: '🖼️', png: '🖼️', gif: '🖼️'
  };
  return icons[ext] || '📎';
}

// ===== МОБИЛЬНОЕ МЕНЮ =====
// Добавляем кнопку для открытия сайдбара на телефоне
const chatHeader = document.querySelector('.chat-header');
const toggleBtn = document.createElement('button');
toggleBtn.className = 'sidebar-toggle';
toggleBtn.textContent = '☰';
toggleBtn.style.cssText = `
  background: none;
  border: none;
  color: white;
  font-size: 24px;
  cursor: pointer;
  padding: 4px 8px;
  display: none;
`;

// Вставляем кнопку в шапку
chatHeader.prepend(toggleBtn);

// Показываем кнопку только на телефоне
if (window.innerWidth <= 768) {
  toggleBtn.style.display = 'flex';
}

toggleBtn.addEventListener('click', () => {
  document.getElementById('sidebar').classList.toggle('open');
  
  // Создаём оверлей
  let overlay = document.querySelector('.sidebar-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.className = 'sidebar-overlay';
    document.body.appendChild(overlay);
  }
  overlay.classList.toggle('active');
  overlay.addEventListener('click', () => {
    document.getElementById('sidebar').classList.remove('open');
    overlay.classList.remove('active');
  });
});

// Закрываем сайдбар при клике вне него
document.addEventListener('click', (e) => {
  const sidebar = document.getElementById('sidebar');
  const toggle = document.querySelector('.sidebar-toggle');
  if (window.innerWidth <= 768) {
    if (!sidebar.contains(e.target) && !toggle.contains(e.target)) {
      sidebar.classList.remove('open');
      const overlay = document.querySelector('.sidebar-overlay');
      if (overlay) overlay.classList.remove('active');
    }
  }
});

// Фокус на поле ввода
registerInput.focus();