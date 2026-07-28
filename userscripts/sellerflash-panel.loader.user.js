// ==UserScript==
// @name         SellerFlash Panel — Loader (GitHub)
// @namespace    http://tampermonkey.net/
// @version      1.0.0
// @description  Ana panel kodunu GitHub'dan çeker. Bu ince loader'ı bir kez kurarsınız; asıl kod her zaman GitHub'daki son sürümden yüklenir.
// @author       Kerem Yeniçay
// @match        https://panel.sellerflash.com/*
// @match        https://a1.asendiausa.com/*
// @match        https://dc.preplarge.com/*
// @match        https://comfy.comfyship.com/*
// @match        https://app.fullfillonus.com/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_xmlhttpRequest
// @connect      dafwjdizftgjcsjbnzgs.supabase.co
// @connect      a1reportapi.asendiaprod.com
// @run-at       document-idle
// @require      https://raw.githubusercontent.com/keremyenicay/sfadminlog/main/userscripts/sellerflash-panel.user.js
// ==/UserScript==

// Bu dosya kasıtlı olarak boştur. Tüm mantık @require ile GitHub'daki
// sellerflash-panel.user.js dosyasından yüklenir.
//
// NOTLAR:
// 1) @require yalnızca dosya HERKESE AÇIK URL'den erişilebilirse çalışır.
//    keremyenicay/sfadminlog reposu PRIVATE ise raw.githubusercontent.com 404 döner
//    ve kod yüklenmez. Bu durumda repoyu public yapın VEYA ana scripti doğrudan kurun.
// 2) Ana kod henüz 'main'e merge edilmediyse, yukarıdaki URL'de 'main' yerine
//    geçici olarak 'claude/amazon-plugin-data-sources-ypijd0' branch adını kullanın.
// 3) Tampermonkey @require içeriğini önbelleğe alır; "Externals" güncelleme
//    aralığına göre yeniler (anında değil). Anında güncelleme için ana scripti
//    doğrudan @updateURL ile kurmak daha iyidir.
