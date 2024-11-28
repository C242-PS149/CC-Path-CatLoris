const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const authenticate = require('./authMiddleware');
const db = require('../../../db');
require('dotenv').config(); // Menggunakan .env untuk menyimpan variabel lingkungan
const router = express.Router();

// Kunci rahasia untuk JWT
const SECRET_KEY = process.env.SECRET_KEY;

// Registrasi User (Membuat akun baru) REGISTER
router.post('/users/register', async (req, res) => {
  const { user_id, image, fullname, email, password, contact, gender } = req.body;

  try {
    const hashedPassword = await bcrypt.hash(password, 10);

    const query = 'INSERT INTO users (user_id, image, fullname, email, password, contact, gender) VALUES (?, ?, ?, ?, ?, ?, ?)';
    db.query(query, [user_id, image, fullname, email, hashedPassword, contact, gender], (err, result) => {
      if (err) {
        console.error('Error inserting data:', err);
        return res.status(500).json({ error: true, status: 'failure', message: 'Error memasukkan data 500.' });
      }

      res.status(201).json({
        error: false,
        status: 'success',
        message: 'User berhasil ditambahkan 201.',
        data: { userId: user_id },
      });
    });
  } catch (error) {
    console.error('Error hashing password:', error);
    res.status(500).json({ error: true, status: 'failure', message: 'Error register user 500.' });
  }
});

// Login User (Mendapatkan token setelah login) LOGIN
router.post('/auth/login', (req, res) => {
  const { email, password } = req.body;

  const query = 'SELECT * FROM users WHERE email = ?';
  db.query(query, [email], async (err, results) => {
    if (err) {
      console.error('Error mengambil pengguna:', err);
      return res.status(500).json({ error: true, status: 'failure', message: 'Error mengambil pengguna 500.' });
    }

    if (results.length === 0) {
      return res.status(404).json({ error: true, status: 'failure', message: 'User tidak ditemukan 404.' });
    }

    const user = results[0];
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ error: true, status: 'failure', message: 'Kredensial tidak valid 401.' });
    }

    // Membuat Access Token (berlaku selama 1 jam)
    const accessToken = jwt.sign({ userId: user.user_id, email: user.email }, SECRET_KEY, { expiresIn: '1h' });

    // Membuat Refresh Token (berlaku selama 7 hari)
    const refreshToken = jwt.sign({ userId: user.user_id, email: user.email }, SECRET_KEY, { expiresIn: '7d' });

    // Menyimpan Refresh Token ke database
    const insertTokenQuery = 'INSERT INTO refresh_tokens (user_id, token) VALUES (?, ?)';
    db.query(insertTokenQuery, [user.user_id, refreshToken], (err, result) => {
      if (err) {
        console.error('Error menyimpan refresh token:', err);
        return res.status(500).json({ error: true, message: 'Error menyimpan refresh token.' });
      }

      res.status(200).json({
        error: false,
        message: 'Login berhasil!',
        data: { accessToken, refreshToken },
      });
    });
  });
});

// lihat profile user
router.get('/users/profile', authenticate, (req, res) => {
  const userId = req.userId; // userId diperoleh dari middleware `authenticate`

  const query = 'SELECT user_id, image, fullname, email, contact, gender FROM users WHERE user_id = ?';
  db.query(query, [userId], (err, results) => {
    if (err) {
      console.error('Error mengambil data profil:', err);
      return res.status(500).json({
        error: true,
        status: 'failure',
        message: 'Error mengambil data profil.',
      });
    }

    if (results.length === 0) {
      return res.status(404).json({
        error: true,
        status: 'failure',
        message: 'Profil pengguna tidak ditemukan.',
      });
    }

    res.status(200).json({
      error: false,
      status: 'success',
      message: 'Profil pengguna berhasil diambil.',
      data: results[0],
    });
  });
});

// Update Profil User
router.put('/users/update', authenticate, (req, res) => {
  const userId = req.userId; // userId diperoleh dari middleware `authenticate`
  const { image, fullname, email, contact, gender } = req.body;

  if (!image && !fullname && !email && !contact && !gender) {
    return res.status(400).json({
      error: true,
      status: 'failure',
      message: 'Tidak ada data yang diperbarui.',
    });
  }

  // Query untuk memperbarui data pengguna
  const query = `
    UPDATE users 
    SET image = ?, fullname = ?, email = ?, contact = ?, gender = ? 
    WHERE user_id = ?
  `;

  db.query(query, [image, fullname, email, contact, gender, userId], (err, result) => {
    if (err) {
      console.error('Error memperbarui profil:', err);
      return res.status(500).json({
        error: true,
        status: 'failure',
        message: 'Error memperbarui profil.',
      });
    }

    if (result.affectedRows === 0) {
      return res.status(404).json({
        error: true,
        status: 'failure',
        message: 'Profil pengguna tidak ditemukan.',
      });
    }

    res.status(200).json({
      error: false,
      status: 'success',
      message: 'Profil pengguna berhasil diperbarui.',
    });
  });
});

// Update Access Token (Perbarui Token Akses) Menggunakan Refresh Token
router.put('/auth', (req, res) => {
  const { refreshToken } = req.body;

  // Validasi input refresh token
  if (!refreshToken) {
    return res.status(400).json({
      error: true,
      status: 'failure',
      message: 'Refresh token tidak boleh kosong.',
    });
  }

  // Memverifikasi refresh token
  jwt.verify(refreshToken, SECRET_KEY, (err, decoded) => {
    if (err) {
      return res.status(403).json({
        error: true,
        status: 'failure',
        message: 'Refresh token tidak valid.',
      });
    }

    // Membuat access token baru
    const accessToken = jwt.sign({ userId: decoded.userId, email: decoded.email }, SECRET_KEY, { expiresIn: '1h' });

    res.status(200).json({
      error: false,
      status: 'success',
      message: 'Access Token berhasil diperbarui',
      data: { accessToken },
    });
  });
});

// Logout (Hapus Refresh Token)
router.delete('/auth/logout', (req, res) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    return res.status(400).json({
      error: true,
      status: 'failure',
      message: 'Refresh token tidak boleh kosong.',
    });
  }

  // Validasi refresh token sebelum dihapus
  jwt.verify(refreshToken, process.env.SECRET_KEY, (err, decoded) => {
    if (err) {
      return res.status(403).json({
        error: true,
        status: 'failure',
        message: 'Refresh token tidak valid.',
      });
    }

    // Hapus refresh token dari database
    const deleteTokenQuery = 'DELETE FROM refresh_tokens WHERE token = ?';
    db.query(deleteTokenQuery, [refreshToken], (err, result) => {
      if (err) {
        console.error('Error menghapus refresh token:', err);
        return res.status(500).json({
          error: true,
          status: 'failure',
          message: 'Error menghapus refresh token.',
        });
      }

      if (result.affectedRows === 0) {
        return res.status(404).json({
          error: true,
          status: 'failure',
          message: 'Refresh token tidak ditemukan.',
        });
      }

      res.status(200).json({
        error: false,
        status: 'success',
        message: 'Refresh token berhasil dihapus.',
      });
    });
  });
});


// Delete Account (Hapus Akun Pengguna)
router.delete('/users/delete', authenticate, (req, res) => {
  const userId = req.userId;
  const { refreshToken } = req.body;

  if (!userId || !refreshToken) {
    return res.status(400).json({
      error: true,
      status: 'failure',
      message: 'User ID atau Refresh token tidak ditemukan dalam permintaan.',
    });
  }

  // Mulai transaksi database
  db.beginTransaction((err) => {
    if (err) {
      console.error('Error memulai transaksi:', err);
      return res.status(500).json({
        error: true,
        status: 'failure',
        message: 'Error memulai transaksi.',
      });
    }

    // Hapus refresh token terkait terlebih dahulu
    const deleteTokenQuery = 'DELETE FROM refresh_tokens WHERE token = ? AND user_id = ?';
    db.query(deleteTokenQuery, [refreshToken, userId], (err, result) => {
      if (err) {
        console.error('Error menghapus refresh token:', err);
        return db.rollback(() => {
          res.status(500).json({
            error: true,
            status: 'failure',
            message: 'Error menghapus refresh token.',
          });
        });
      }

      if (result.affectedRows === 0) {
        return db.rollback(() => {
          res.status(404).json({
            error: true,
            status: 'failure',
            message: 'Refresh token tidak ditemukan.',
          });
        });
      }

      // Hapus data dari tabel user_physical_metrics yang terkait dengan user_id
      const deletePhysicalMetricsQuery = 'DELETE FROM user_physical_metrics WHERE user_id = ?';
      db.query(deletePhysicalMetricsQuery, [userId], (err, result) => {
        if (err) {
          console.error('Error menghapus data fisik pengguna:', err);
          return db.rollback(() => {
            res.status(500).json({
              error: true,
              status: 'failure',
              message: 'Error menghapus data fisik pengguna.',
            });
          });
        }

        // Hapus akun pengguna setelah data fisik dihapus
        const deleteUserQuery = 'DELETE FROM users WHERE user_id = ?';
        db.query(deleteUserQuery, [userId], (err, result) => {
          if (err) {
            console.error('Error menghapus akun:', err);
            return db.rollback(() => {
              res.status(500).json({
                error: true,
                status: 'failure',
                message: 'Error menghapus akun.',
              });
            });
          }

          if (result.affectedRows === 0) {
            return db.rollback(() => {
              res.status(404).json({
                error: true,
                status: 'failure',
                message: 'Akun tidak ditemukan.',
              });
            });
          }

          // Commit transaksi jika semua berhasil
          db.commit((err) => {
            if (err) {
              console.error('Error melakukan commit:', err);
              return db.rollback(() => {
                res.status(500).json({
                  error: true,
                  status: 'failure',
                  message: 'Error menyelesaikan transaksi.',
                });
              });
            }

            res.status(200).json({
              error: false,
              status: 'success',
              message: 'Akun dan data terkait berhasil dihapus.',
            });
          });
        });
      });
    });
  });
});

module.exports = router;