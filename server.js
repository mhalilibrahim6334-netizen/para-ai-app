const express = require("express");
const cors = require("cors");
const axios = require("axios");
const crypto = require("crypto");
const { createClient } = require("@supabase/supabase-js");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static("public"));

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

function hashPassword(password) {
  return crypto.createHash("sha256").update(password).digest("hex");
}

function createToken() {
  return crypto.randomBytes(32).toString("hex");
}

async function getSessionUser(token) {
  if (!token) return null;

  const sessionResult = await supabase
    .from("sessions")
    .select("*")
    .eq("token", token)
    .maybeSingle();

  if (sessionResult.error || !sessionResult.data) {
    return null;
  }

  const userResult = await supabase
    .from("users")
    .select("*")
    .eq("username", sessionResult.data.username)
    .maybeSingle();

  if (userResult.error || !userResult.data) {
    return null;
  }

  return userResult.data;
}

app.get("/", function (req, res) {
  res.sendFile(__dirname + "/public/index.html");
});

app.post("/register", async function (req, res) {
  try {
    var username = (req.body.username || "").trim();
    var password = (req.body.password || "").trim();

    if (!username || !password) {
      return res.json({
        success: false,
        message: "Kullanici adi ve sifre zorunlu."
      });
    }

    var hashed = hashPassword(password);

    const check = await supabase
      .from("users")
      .select("id")
      .eq("username", username)
      .maybeSingle();

    if (check.data) {
      return res.json({
        success: false,
        message: "Bu kullanici adi zaten var."
      });
    }

    const insertResult = await supabase
      .from("users")
      .insert([
        {
          username: username,
          password: hashed,
          premium: false,
          dailycount: 0
        }
      ]);

    if (insertResult.error) {
      return res.json({
        success: false,
        message: "Kayit hatasi: " + insertResult.error.message
      });
    }

    return res.json({
      success: true,
      message: "Kayit basarili."
    });
  } catch (err) {
    return res.json({
      success: false,
      message: "Hata: " + err.message
    });
  }
});

app.post("/login", async function (req, res) {
  try {
    var username = (req.body.username || "").trim();
    var password = (req.body.password || "").trim();

    if (!username || !password) {
      return res.json({
        success: false,
        message: "Kullanici adi ve sifre zorunlu."
      });
    }

    var hashed = hashPassword(password);

    const result = await supabase
      .from("users")
      .select("*")
      .eq("username", username)
      .eq("password", hashed)
      .maybeSingle();

    if (result.error) {
      return res.json({
        success: false,
        message: "Giris hatasi: " + result.error.message
      });
    }

    if (!result.data) {
      return res.json({
        success: false,
        message: "Kullanici adi veya sifre yanlis."
      });
    }

    var token = createToken();

    const sessionInsert = await supabase
      .from("sessions")
      .insert([
        {
          username: username,
          token: token
        }
      ]);

    if (sessionInsert.error) {
      return res.json({
        success: false,
        message: "Session kaydedilemedi: " + sessionInsert.error.message
      });
    }

    return res.json({
      success: true,
      message: "Giris basarili.",
      token: token,
      user: {
        username: result.data.username,
        premium: !!result.data.premium,
        dailyCount: result.data.dailycount
      }
    });
  } catch (err) {
    return res.json({
      success: false,
      message: "Hata: " + err.message
    });
  }
});

app.post("/logout", async function (req, res) {
  try {
    var token = (req.body.token || "").trim();

    if (!token) {
      return res.json({
        success: false,
        message: "Token yok."
      });
    }

    const delResult = await supabase
      .from("sessions")
      .delete()
      .eq("token", token);

    if (delResult.error) {
      return res.json({
        success: false,
        message: "Cikis hatasi: " + delResult.error.message
      });
    }

    return res.json({
      success: true,
      message: "Cikis yapildi."
    });
  } catch (err) {
    return res.json({
      success: false,
      message: "Hata: " + err.message
    });
  }
});

app.post("/me", async function (req, res) {
  try {
    var token = (req.body.token || "").trim();
    var user = await getSessionUser(token);

    if (!user) {
      return res.json({
        success: false,
        message: "Oturum gecersiz."
      });
    }

    return res.json({
      success: true,
      user: {
        username: user.username,
        premium: !!user.premium,
        dailyCount: user.dailycount
      }
    });
  } catch (err) {
    return res.json({
      success: false,
      message: "Hata: " + err.message
    });
  }
});

app.get("/status", async function (req, res) {
  try {
    var username = (req.query.username || "").trim();

    const result = await supabase
      .from("users")
      .select("*")
      .eq("username", username)
      .maybeSingle();

    if (result.error || !result.data) {
      return res.json({
        success: false,
        message: "Kullanici bulunamadi."
      });
    }

    return res.json({
      success: true,
      username: result.data.username,
      premium: !!result.data.premium,
      dailyCount: result.data.dailycount,
      remainingFree: result.data.premium ? "sinirsiz" : Math.max(0, 1 - result.data.dailycount)
    });
  } catch (err) {
    return res.json({
      success: false,
      message: "Hata: " + err.message
    });
  }
});

app.post("/set-premium", async function (req, res) {
  try {
    var username = (req.body.username || "").trim();
    var premium = req.body.premium === true;

    const result = await supabase
      .from("users")
      .update({ premium: premium })
      .eq("username", username);

    if (result.error) {
      return res.json({
        success: false,
        message: "Premium guncelleme hatasi: " + result.error.message
      });
    }

    return res.json({
      success: true,
      message: premium ? "Premium aktif edildi." : "Premium kapatildi."
    });
  } catch (err) {
    return res.json({
      success: false,
      message: "Hata: " + err.message
    });
  }
});

app.post("/reset-count", async function (req, res) {
  try {
    var username = (req.body.username || "").trim();

    const result = await supabase
      .from("users")
      .update({ dailycount: 0 })
      .eq("username", username);

    if (result.error) {
      return res.json({
        success: false,
        message: "Sifirlama hatasi: " + result.error.message
      });
    }

    return res.json({
      success: true,
      message: "Gunluk kullanim sifirlandi."
    });
  } catch (err) {
    return res.json({
      success: false,
      message: "Hata: " + err.message
    });
  }
});

app.post("/task", async function (req, res) {
  try {
    var token = (req.body.token || "").trim();
    var goal = (req.body.goal || "").trim();
    var category = (req.body.category || "genel").trim();

    var user = await getSessionUser(token);

    if (!user) {
      return res.json({
        success: false,
        task: "Kullanici bulunamadi. Tekrar giris yap."
      });
    }

    if (!goal) {
      return res.json({
        success: false,
        task: "Lutfen bir hedef yaz."
      });
    }

    if (!user.premium && user.dailycount >= 1) {
      return res.json({
        success: true,
        locked: true,
        task: "Ucretsiz limitin doldu. Bugun 1 gorev kullandin. Sinirsiz gorev icin premium al."
      });
    }

    var prompt =
      "Kullanici para kazanmak istiyor. " +
      "Kategori: " + category + ". " +
      "Hedef: " + goal + ". " +
      "Tek bir net gorev ver. " +
      "Cevabi su formatta ver:\n" +
      "GOREV:\n" +
      "PLATFORM:\n" +
      "MESAJ:\n" +
      "TAHMINI_KAZANC:\n" +
      "ADIMLAR:";

    const aiResponse = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: "Sen para kazandiran bir asistansin. Hep uygulanabilir, net, kisa gorev ver."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        temperature: 0.7
      },
      {
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer " + process.env.OPENAI_API_KEY
        }
      }
    );

    var text = aiResponse.data.choices[0].message.content;

    const updateResult = await supabase
      .from("users")
      .update({ dailycount: user.dailycount + 1 })
      .eq("username", user.username);

    if (updateResult.error) {
      return res.json({
        success: false,
        task: "Kullanim guncellenemedi: " + updateResult.error.message
      });
    }

    return res.json({
      success: true,
      locked: false,
      task: text
    });
  } catch (err) {
    if (err.response && err.response.data) {
      return res.json({
        success: false,
        task: "API hatasi: " + JSON.stringify(err.response.data)
      });
    }

    return res.json({
      success: false,
      task: "Hata: " + err.message
    });
  }
});

app.listen(PORT, function () {
  console.log("Server calisiyor: http://localhost:" + PORT);
});