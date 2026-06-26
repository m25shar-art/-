const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const multer = require('multer');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Создаём папку для файлов
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

// Настройка multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, unique + '-' + file.originalname);
  }
});

const upload = multer({ 
  storage,
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB
});

// Раздача статики
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(uploadDir));

// Хранилище сообщений
const messages = [];
const users = new Set();

// Загрузка файлов
app.post('/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Нет файла' });
  
  const fileUrl = `/uploads/${req.file.filename}`;
  const fileType = req.file.mimetype.startsWith('image/') ? 'image' :
                   req.file.mimetype.startsWith('video/') ? 'video' : 'file';
  
  res.json({
    url: fileUrl,
    type: fileType,
    name: req.file.originalname,
    size: req.file.size
  });
});

// Socket.IO
io.on('connection', (socket) => {
  console.log('🔵 Новый пользователь');

  // Регистрация имени
  socket.on('register', (username) => {
    socket.username = username;
    users.add(username);
    
    // Отправляем историю новому пользователю
    socket.emit('history', messages);
    
    // Рассылаем список пользователей
    io.emit('usersList', Array.from(users));
    io.emit('userJoined', username);
    
    console.log(`👤 ${username} присоединился`);
  });

  // Новое сообщение
  socket.on('sendMessage', (data) => {
    const message = {
      id: Date.now(),
      username: socket.username || 'Аноним',
      text: data.text || '',
      file: data.file || null,
      time: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
      date: new Date().toLocaleDateString('ru-RU')
    };
    
    messages.push(message);
    if (messages.length > 200) messages.shift();
    
    io.emit('newMessage', message);
  });

  // Печатает...
  socket.on('typing', (isTyping) => {
    socket.broadcast.emit('userTyping', {
      username: socket.username,
      isTyping
    });
  });

  // Отключение
  socket.on('disconnect', () => {
    if (socket.username) {
      users.delete(socket.username);
      io.emit('usersList', Array.from(users));
      io.emit('userLeft', socket.username);
      console.log(`🔴 ${socket.username} вышел`);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`✅ Сервер запущен: http://localhost:${PORT}`);
});