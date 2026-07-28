// ==UserScript==
// @name         SellerFlash Panel (Sunucu Modu)
// @namespace    http://tampermonkey.net/
// @version      2.0.2
// @description  Hafif panel — tüm otomasyon sunucuda çalışır. Bu eklenti sadece UI gösterir. SF token manuel olarak Supabase'e girilmeli.
// @author       Kerem Yeniçay & AI
// @downloadURL  https://raw.githubusercontent.com/keremyenicay/sfadminlog/main/userscripts/sellerflash-panel.user.js
// @updateURL    https://raw.githubusercontent.com/keremyenicay/sfadminlog/main/userscripts/sellerflash-panel.user.js
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
// ==/UserScript==

(async function () {
    'use strict';

    // ─────────────────────────────────────────────
    // AYARLAR
    // ─────────────────────────────────────────────
    const CLOUD = {
        URL:    'https://dafwjdizftgjcsjbnzgs.supabase.co',
        APIKEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRhZndqZGl6ZnRnamNzamJuemdzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ5NzkwOTEsImV4cCI6MjA5MDU1NTA5MX0.HbqJilhLVm-rBr1FveSuejlVDVJX2efGPvvV5-USmO0',
    };

    // ─────────────────────────────────────────────
    // DURUM DEĞİŞKENLERİ
    // ─────────────────────────────────────────────
    let DB             = {};
    let ACCOUNTS       = [];
    let CURRENT_MKT_ID = GM_getValue('SF_LAST_MKT_ID', null);
    let HIDDEN_ORDERS  = new Set(JSON.parse(GM_getValue('SF_HIDDEN_ORDERS', '[]')));
    let SELECTED_ROWS  = new Set();
    let CURRENT_FILTER = 'ALL';
    let TABLE_SEARCH   = { sfId:'', asin:'', buyerId:'', status:'', amzTrack:'', warehouse:'', depoNo:'', shipId:'', tracking:'', cargo:'', whStatus:'', delivery:'' };

    // Virtual scroll state
    const VS = { ROW_H: 38, OVERSCAN: 5, data: [], start: -1, end: -1, tw: null, tbody: null, spacerT: null, spacerB: null, _raf: null, _bound: null };

    // ─────────────────────────────────────────────
    // SUPABASE YARDIMCILARI
    // ─────────────────────────────────────────────
    function cloudGet(key) {
        return new Promise(resolve => {
            GM_xmlhttpRequest({
                method: 'GET',
                url: `${CLOUD.URL}/rest/v1/sf_store?key=eq.${encodeURIComponent(key)}&select=value`,
                headers: { 'apikey': CLOUD.APIKEY, 'Authorization': `Bearer ${CLOUD.APIKEY}` },
                timeout: 10000,
                onload: r => {
                    try { const rows = JSON.parse(r.responseText); resolve(rows?.[0]?.value ?? null); }
                    catch(e) { resolve(null); }
                },
                onerror: () => resolve(null),
                ontimeout: () => resolve(null),
            });
        });
    }

    function cloudPut(key, value) {
        return new Promise(resolve => {
            GM_xmlhttpRequest({
                method: 'POST',
                url: `${CLOUD.URL}/rest/v1/sf_store`,
                headers: {
                    'apikey': CLOUD.APIKEY,
                    'Authorization': `Bearer ${CLOUD.APIKEY}`,
                    'Content-Type': 'application/json',
                    'Prefer': 'resolution=merge-duplicates',
                },
                data: JSON.stringify({ key, value }),
                timeout: 10000,
                onload: () => resolve(true),
                onerror: () => resolve(false),
                ontimeout: () => resolve(false),
            });
        });
    }

    // ─────────────────────────────────────────────
    // DEPO pV TOKEN YAKALAMA — orijinal dosyayla birebir aynı
    // dc.preplarge.com, comfy.comfyship.com, app.fullfillonus.com
    // XHR/fetch intercept + script tag scan → GM_setValue + Supabase'e yaz
    // ─────────────────────────────────────────────
    (function captureWarehousePvToken() {
        const host = window.location.hostname;
        const isComfy = host.includes('comfyship.com');
        const isPrep  = host.includes('preplarge.com');
        const isFulln = host.includes('fullfillonus.com');
        if (!isComfy && !isPrep && !isFulln) return;

        const pvKey   = isComfy ? 'SF_COMFY_PV' : isPrep ? 'SF_PREP_PV' : 'SF_FULLN_PV';
        const whLabel = isComfy ? 'COMFYSHIP'   : isPrep ? 'PREPLARGE'  : 'FULLFILLONUS';

        function savePv(pv) {
            if (!pv || pv.length < 10) return;
            // GM_setValue — local kayıt
            GM_setValue(pvKey, pv);
            // Supabase'e yaz — sunucu bu token'ı kullanır
            const supabaseUrl = 'https://dafwjdizftgjcsjbnzgs.supabase.co/rest/v1/sf_store';
            const apiKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRhZndqZGl6ZnRnamNzamJuemdzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ5NzkwOTEsImV4cCI6MjA5MDU1NTA5MX0.HbqJilhLVm-rBr1FveSuejlVDVJX2efGPvvV5-USmO0';
            GM_xmlhttpRequest({
                method: 'POST',
                url: supabaseUrl,
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': apiKey,
                    'Authorization': 'Bearer ' + apiKey,
                    'Prefer': 'resolution=merge-duplicates',
                },
                data: JSON.stringify({ key: pvKey, value: pv, updated_at: new Date().toISOString() }),
                timeout: 10000,
                onload: () => console.log('[SF] ' + whLabel + ' pV Supabase\u2019ye yaz\u0131ld\u0131'),
                onerror: () => console.warn('[SF] ' + whLabel + ' pV Supabase hatas\u0131'),
            });
            showCaptureNotice(whLabel);
        }

        // XHR intercept — DataTable/getTable isteğindeki pV'yi yakala
        const origOpen = XMLHttpRequest.prototype.open;
        XMLHttpRequest.prototype.open = function(method, url) {
            this.__sfUrl = typeof url === 'string' ? url : '';
            return origOpen.apply(this, arguments);
        };
        const origSend = XMLHttpRequest.prototype.send;
        XMLHttpRequest.prototype.send = function(body) {
            if (this.__sfUrl && this.__sfUrl.includes('DataTable/getTable') && body) {
                const bodyStr = typeof body === 'string' ? body
                    : body instanceof URLSearchParams ? body.toString() : '';
                const m = bodyStr.match(/(?:^|&)pV=([^&]*)/);
                if (m && m[1]) savePv(decodeURIComponent(m[1]));
            }
            return origSend.apply(this, arguments);
        };

        // Fetch intercept
        const origFetch = window.fetch;
        window.fetch = function(input, init) {
            const url = typeof input === 'string' ? input : (input && input.url) || '';
            if (url.includes('DataTable/getTable') && init && init.body) {
                const body = typeof init.body === 'string' ? init.body
                    : init.body instanceof URLSearchParams ? init.body.toString() : '';
                const m = body.match(/(?:^|&)pV=([^&]*)/);
                if (m && m[1]) savePv(decodeURIComponent(m[1]));
            }
            return origFetch.apply(this, arguments);
        };

        // Script tag'lerinden pV tara (sayfa kaynak kodunda gömülü olabilir)
        function scanScriptTags() {
            document.querySelectorAll('script:not([src])').forEach(s => {
                const m = s.textContent.match(/['"](57[A-Za-z0-9+/=]{20,})['"]/);
                if (m && m[1] && m[1].length > 20) savePv(m[1]);
            });
        }
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scanScriptTags);
        else scanScriptTags();
        window.addEventListener('load', scanScriptTags);

        function showCaptureNotice(label) {
            let notice = document.getElementById('sf-pv-notice');
            if (!notice) {
                notice = document.createElement('div');
                notice.id = 'sf-pv-notice';
                notice.style.cssText = 'position:fixed;top:10px;right:10px;z-index:999999;background:#16a34a;color:#fff;padding:10px 16px;border-radius:8px;font-family:sans-serif;font-size:13px;font-weight:700;box-shadow:0 4px 12px rgba(0,0,0,.3);transition:opacity .5s';
                document.body && document.body.appendChild(notice);
            }
            notice.style.opacity = '1';
            notice.textContent = '\u2705 SF: ' + label + ' token yakaland\u0131! Sunucuya g\u00f6nderildi.';
            setTimeout(() => { if (notice) notice.style.opacity = '0'; }, 4000);
        }

        console.log('[SF] ' + whLabel + ' pV yakalay\u0131c\u0131 aktif.');
    })();

    // ─────────────────────────────────────────────
    // ASENDİA TOKEN YAKALAMA — a1.asendiausa.com'da çalışır
    // ─────────────────────────────────────────────
    (function interceptAsendia() {
        if (!window.location.hostname.includes('asendiausa.com')) return;

        const _origOpen = XMLHttpRequest.prototype.open;
        XMLHttpRequest.prototype.open = function(method, url) {
            this.__sfUrl = typeof url === 'string' ? url : '';
            return _origOpen.apply(this, arguments);
        };

        const _origSetHeader = XMLHttpRequest.prototype.setRequestHeader;
        XMLHttpRequest.prototype.setRequestHeader = function(name, value) {
            if (this.__sfUrl && this.__sfUrl.includes('a1reportapi.asendiaprod.com')) {
                const nameLow = name.toLowerCase();
                if (nameLow === 'authorization' && value.startsWith('Basic ')) {
                    const bAuth = value.slice(6).trim();
                    GM_setValue('SF_ASENDIA_BAUTH', bAuth);
                    cloudPut('SF_ASENDIA_BAUTH', bAuth);
                    console.log('[SF] Asendia BAUTH yakalandı');
                }
                if (nameLow === 'x-asendiaone-apikey' && value.length > 5) {
                    GM_setValue('SF_ASENDIA_APIKEY', value);
                    cloudPut('SF_ASENDIA_APIKEY', value);
                    console.log('[SF] Asendia APIKEY yakalandı');
                }
            }
            return _origSetHeader.apply(this, arguments);
        };

        // URL'den trackingKey parametresini yakala
        const _origFetch = window.fetch;
        window.fetch = function(input, init) {
            const url = typeof input === 'string' ? input : (input?.url || '');
            if (url.includes('a1reportapi.asendiaprod.com') && url.includes('trackingKey=')) {
                const m = url.match(/trackingKey=([^&]+)/);
                if (m) {
                    const tKey = decodeURIComponent(m[1]);
                    GM_setValue('SF_ASENDIA_TKEY', tKey);
                    cloudPut('SF_ASENDIA_TKEY', tKey);
                    console.log('[SF] Asendia TKEY yakalandı');
                }
                if (init?.headers) {
                    const auth = init.headers['authorization'] || init.headers['Authorization'] || '';
                    const apiKey = init.headers['x-asendiaone-apikey'] || init.headers['X-AsendiaOne-ApiKey'] || '';
                    if (auth.startsWith('Basic ')) {
                        const bAuth = auth.slice(6).trim();
                        GM_setValue('SF_ASENDIA_BAUTH', bAuth);
                        cloudPut('SF_ASENDIA_BAUTH', bAuth);
                    }
                    if (apiKey.length > 5) {
                        GM_setValue('SF_ASENDIA_APIKEY', apiKey);
                        cloudPut('SF_ASENDIA_APIKEY', apiKey);
                    }
                }
            }
            return _origFetch.apply(this, arguments);
        };

        // Yakalama tamamlandığında bildirim göster
        const _origXHRSend = XMLHttpRequest.prototype.send;
        XMLHttpRequest.prototype.send = function(body) {
            if (this.__sfUrl && this.__sfUrl.includes('a1reportapi.asendiaprod.com')) {
                // URL'den trackingKey çek
                const m = this.__sfUrl.match(/trackingKey=([^&]+)/);
                if (m) {
                    const tKey = decodeURIComponent(m[1]);
                    GM_setValue('SF_ASENDIA_TKEY', tKey);
                    cloudPut('SF_ASENDIA_TKEY', tKey);
                    // Bildirim göster
                    setTimeout(() => {
                        const div = document.createElement('div');
                        div.style.cssText = 'position:fixed;top:10px;right:10px;z-index:999999;background:#27ae60;color:#fff;padding:10px 16px;border-radius:8px;font-family:sans-serif;font-size:13px;font-weight:700;box-shadow:0 4px 12px rgba(0,0,0,.3);';
                        div.textContent = '✅ SF: Asendia token yakalandı! Sunucuya gönderildi.';
                        document.body.appendChild(div);
                        setTimeout(() => div.remove(), 4000);
                    }, 500);
                }
            }
            return _origXHRSend.apply(this, arguments);
        };
    })();

    // SF Token otomatik yakalama kaldırıldı — tokenler manuel olarak Supabase'e girilmeli.

    // ─────────────────────────────────────────────
    // MARKETPLACEİD TESPİT
    // selectedMarket key'inden alıyoruz
    // ─────────────────────────────────────────────
    function detectMarketplaceId() {
        try {
            const raw = localStorage.getItem('selectedMarket');
            if (!raw) return null;
            const data = JSON.parse(raw);
            // id = customer marketplace id (78524 gibi)
            const id = data?.id || data?.marketPlaceId || data?.customerMarketPlaceId;
            return id ? String(id) : null;
        } catch(e) { return null; }
    }

    function getStoreName() {
        try {
            const raw = localStorage.getItem('selectedMarket');
            if (!raw) return null;
            return JSON.parse(raw)?.storeName || null;
        } catch(e) { return null; }
    }

    // ─────────────────────────────────────────────
    // CLOUD'DAN VERİ YÜKLE
    // ─────────────────────────────────────────────
    async function pullData() {
        const mktId = CURRENT_MKT_ID;
        if (!mktId) return;
        try {
            const [dbRaw, accounts] = await Promise.all([
                cloudGet(`DB_${mktId}`),
                cloudGet('ACCOUNTS'),
            ]);
            DB       = dbRaw ? (typeof dbRaw === 'string' ? JSON.parse(dbRaw) : dbRaw) : {};
            ACCOUNTS = accounts || [];
        } catch(e) {
            DB = {}; ACCOUNTS = [];
        }
    }

    // ─────────────────────────────────────────────
    // DB KAYDET
    // ─────────────────────────────────────────────
    let _saveTimer = null;
    function saveDB() {
        if (_saveTimer) clearTimeout(_saveTimer);
        _saveTimer = setTimeout(() => {
            if (!CURRENT_MKT_ID) return;
            cloudPut(`DB_${CURRENT_MKT_ID}`, JSON.stringify(DB));
        }, 3000);
    }

    function updateOrder(id, updates) {
        if (!DB[id]) DB[id] = {};
        Object.assign(DB[id], updates);
        saveDB();
    }

    // ─────────────────────────────────────────────
    // SİPARİŞ DURUMU YARDIMCILARI
    // ─────────────────────────────────────────────
    const OrderState = {
        // Teslim: sfDelivered VEYA whTrackStatus teslim içeriyor VEYA Amazon Delivered + kargo var
        isDelivered: o => {
            if (o.sfDelivered) return true;
            if (o.whTrackStatus?.toLowerCase().includes('teslim')) return true;
            if (o.whTrackStatus?.toLowerCase().includes('delivered') && o.whTracking) return true;
            return false;
        },
        // Kargoda: depodan çıkmış (isShipped=true) VE teslim edilmemiş
        // whTrackStatus varsa (kargo hareketi var) veya isShipped flag'i set
        isShipped: o => {
            if (OrderState.isDelivered(o)) return false;
            // Kargo takip numarası var ve hareket var
            if (o.whTracking && o.whTrackStatus && !['Yeni Gönderi','Paket Alındı','Ödeme Bekleniyor','Ödendi','Etiketi Eklendi'].includes(o.whStatus)) return true;
            // isShipped flag'i var
            if (o.isShipped) return true;
            return false;
        },
        // Depoda: Amazon Delivered veya depo bulundu, kargoya verilmemiş
        isDepot: o => {
            if (OrderState.isDelivered(o) || OrderState.isShipped(o)) return false;
            if (o.status === 'Delivered' && !o.isShipped) return true;
            // Depo bulundu, kargo etiketi var ama henüz hareket yok
            if (o.shipmentId && o.whStatus === 'Etiketi Eklendi') return true;
            if (o.shipmentId && o.whStatus === 'Kargoya Verildi' && !o.whTracking) return true;
            return false;
        },
        isComing:    o => !OrderState.isDepot(o) && !OrderState.isShipped(o) && !OrderState.isDelivered(o)
                          && !!o.status && /shipped|arriving|out for delivery/i.test(o.status),
        isOtherAcc:      o => !!(o.status?.includes('Diğer Hesapta') || o.status?.includes('Hesapta 🔄')),
        isSellerRefunded:o => o.isSellerRefunded === true,
        isBuyerRefunded: o => o.isBuyerRefunded  === true,
        isAlarm:         o => !o.isDeadOrder && !o.isSellerRefunded && !o.isBuyerRefunded
                              && !OrderState.isDelivered(o)
                              && !!(o.isCancelledSF || o.hasCargoIssue || o.deliveryOverdue || o.status?.includes('Cancel')),
        isAmz:           o => {
            const d = OrderState.isDelivered(o), s = OrderState.isShipped(o),
                  dep = OrderState.isDepot(o), com = OrderState.isComing(o);
            const oth = OrderState.isOtherAcc(o), ref = o.isSellerRefunded || o.isBuyerRefunded;
            const alm = OrderState.isAlarm(o);
            return !(o.isDeadOrder && !o.idNotFound) && !dep && !com && !s && !d && !oth && !ref && !alm;
        },
    };

    // ─────────────────────────────────────────────
    // BAR (durum çubuğu)
    // ─────────────────────────────────────────────
    function setBar(msg, color) {
        const el = document.getElementById('sf-bar');
        if (el) { el.textContent = msg; el.style.color = color || '#475569'; }
    }

    // ─────────────────────────────────────────────
    // STATS GÜNCELLE
    // ─────────────────────────────────────────────
    function updateStats() {
        const counts = { total:0, amz:0, coming:0, depot:0, shipped:0, delivered:0, alarm:0, sellerRef:0, buyerRef:0, other:0, nopv:0 };
        for (const [id, o] of Object.entries(DB)) {
            if (HIDDEN_ORDERS.has(id)) continue;
            counts.total++;
            if (OrderState.isDelivered(o))      counts.delivered++;
            else if (OrderState.isShipped(o))   counts.shipped++;
            else if (OrderState.isDepot(o) && o.warehouse && o.warehouse !== 'DİĞER' && o.warehouse !== 'BİLİNMİYOR' && o.warehouse !== '—' && o.warehouse !== '')     counts.depot++;
            else if (OrderState.isComing(o))    counts.coming++;
            if (OrderState.isAlarm(o))          counts.alarm++;
            if (OrderState.isSellerRefunded(o)) counts.sellerRef++;
            if (OrderState.isBuyerRefunded(o))  counts.buyerRef++;
            if (OrderState.isOtherAcc(o))       counts.other++;
            if (OrderState.isAmz(o))            counts.amz++;
            if (o.whError === 'NoPV')           counts.nopv++;
        }
        const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
        set('st-total', counts.total); set('st-amz', counts.amz);
        set('st-coming', counts.coming); set('st-depot', counts.depot);
        set('st-shipped', counts.shipped); set('st-delivered', counts.delivered);
        set('st-alarm', counts.alarm); set('st-seller-refunded', counts.sellerRef);
        set('st-buyer-refunded', counts.buyerRef); set('st-other', counts.other);
        set('st-nopv', counts.nopv);
    }

    // ─────────────────────────────────────────────
    // TABLO RENDER (virtual scroll)
    // ─────────────────────────────────────────────
    function renderTable() {
        VS.tw    = document.getElementById('sf-tw');
        VS.tbody = document.getElementById('sf-tbody');
        if (!VS.tbody) return;

        let list = Object.entries(DB).filter(([id, o]) => {
            if (HIDDEN_ORDERS.has(id)) return false;
            if (OrderState.isDelivered(o)) return CURRENT_FILTER === 'DELIVERED' || CURRENT_FILTER === 'ALL';
            if (CURRENT_FILTER === 'DELIVERED') return false;
            return true;
        });

        if (CURRENT_FILTER !== 'ALL' && CURRENT_FILTER !== 'DELIVERED') {
            list = list.filter(([id, o]) => {
                if (CURRENT_FILTER === 'AMZ')             return OrderState.isAmz(o);
                if (CURRENT_FILTER === 'COMING')          return OrderState.isComing(o);
                if (CURRENT_FILTER === 'DEPOT')           return OrderState.isDepot(o) && o.warehouse && o.warehouse !== 'DİĞER' && o.warehouse !== 'BİLİNMİYOR' && o.warehouse !== '—' && o.warehouse !== '';
                if (CURRENT_FILTER === 'SHIPPED')         return OrderState.isShipped(o);
                if (CURRENT_FILTER === 'OTHER')           return OrderState.isOtherAcc(o);
                if (CURRENT_FILTER === 'ALARM')           return OrderState.isAlarm(o);
                if (CURRENT_FILTER === 'SELLER_REFUNDED') return OrderState.isSellerRefunded(o);
                if (CURRENT_FILTER === 'BUYER_REFUNDED')  return OrderState.isBuyerRefunded(o);
                if (CURRENT_FILTER === 'NOPV')            return o.whError === 'NoPV';
                return true;
            });
        }

        const hasSearch = Object.values(TABLE_SEARCH).some(v => v.length > 0);
        if (hasSearch) {
            list = list.filter(([id, d]) => {
                const sc = TABLE_SEARCH;
                const chk = (val, q) => !q || String(val||'').toLowerCase().includes(q);
                return chk(id, sc.sfId) && chk(d.asin, sc.asin) && chk(d.buyerOrderId, sc.buyerId)
                    && chk(d.status, sc.status) && chk(d.amazonTrackingId, sc.amzTrack)
                    && chk(d.warehouse, sc.warehouse)
                    && chk(d.warehouseId, sc.depoNo) && chk(d.shipmentId, sc.shipId)
                    && chk(d.whTracking, sc.tracking) && chk(d.cargoCompany, sc.cargo)
                    && chk(d.whStatus, sc.whStatus) && chk(d.whTrackStatus, sc.delivery);
            });
        }

        list.sort((a, b) => {
            const da = a[1].orderDate || 0, db = b[1].orderDate || 0;
            if (da !== db) return db - da;
            return String(b[0]).localeCompare(String(a[0]));
        });

        VS.data = list;

        if (VS.tw && !VS.tw._vsInit) {
            VS.tw._vsInit = true;
            VS._bound = () => {
                if (VS._raf) return;
                VS._raf = requestAnimationFrame(() => { VS._raf = null; _vsRender(); });
            };
            VS.tw.addEventListener('scroll', VS._bound, { passive: true });
        }

        const savedScroll = VS.tw ? VS.tw.scrollTop : 0;
        VS.tbody.innerHTML = '';
        VS.spacerT = VS.tbody.insertRow(); VS.spacerT.style.height = '0px';
        VS.spacerB = VS.tbody.insertRow(); VS.spacerB.style.height = '0px';
        VS.start = -1; VS.end = -1;
        if (VS.tw && savedScroll > 0) VS.tw.scrollTop = savedScroll;
        _vsRender();

        const hideBtn = document.getElementById('btn-hide-selected');
        if (hideBtn) hideBtn.style.display = SELECTED_ROWS.size ? 'inline-block' : 'none';
    }

    let _renderTimer = null;
    function renderTableDebounced() {
        if (_renderTimer) return;
        _renderTimer = setTimeout(() => { _renderTimer = null; renderTable(); }, 60);
    }

    function _vsRender() {
        const tw = VS.tw; if (!tw || !VS.data) return;
        const total = VS.data.length, rowH = VS.ROW_H, viewH = tw.clientHeight, scrollY = tw.scrollTop;
        const first = Math.max(0, Math.floor(scrollY / rowH) - VS.OVERSCAN);
        const last  = Math.min(total - 1, Math.ceil((scrollY + viewH) / rowH) + VS.OVERSCAN);
        if (first === VS.start && last === VS.end) return;
        VS.start = first; VS.end = last;
        VS.spacerT.style.height = (first * rowH) + 'px';
        VS.spacerB.style.height = (Math.max(0, total - last - 1) * rowH) + 'px';
        while (VS.tbody.rows.length > 2) VS.tbody.removeChild(VS.tbody.rows[1]);
        const frag = document.createDocumentFragment();
        for (let i = first; i <= last && i < total; i++) {
            const [id, d] = VS.data[i]; frag.appendChild(_buildRow(id, d));
        }
        VS.tbody.insertBefore(frag, VS.spacerB);
    }

    function _buildRow(id, d) {
        const row = document.createElement('tr');
        row.style.height = VS.ROW_H + 'px';
        if (SELECTED_ROWS.has(id))      row.classList.add('sf-selected');
        if (OrderState.isAlarm(d))          row.classList.add('row-alarm');
        else if (OrderState.isSellerRefunded(d)) row.classList.add('row-seller-refunded');
        else if (OrderState.isBuyerRefunded(d))  row.classList.add('row-buyer-refunded');
        else if (OrderState.isDelivered(d))  row.classList.add('row-delivered');
        else if (OrderState.isShipped(d))    row.classList.add('row-shipped');
        else if (OrderState.isDepot(d))      row.classList.add('row-depot');

        // Checkbox
        const chkTd = document.createElement('td');
        chkTd.innerHTML = `<input type="checkbox" ${SELECTED_ROWS.has(id)?'checked':''} style="cursor:pointer;width:14px;height:14px;accent-color:#3b82f6;">`;
        chkTd.querySelector('input').onchange = e => {
            e.target.checked ? SELECTED_ROWS.add(id) : SELECTED_ROWS.delete(id);
            const hb = document.getElementById('btn-hide-selected');
            if (hb) hb.style.display = SELECTED_ROWS.size ? 'inline-block' : 'none';
        };
        row.appendChild(chkTd);

        // Amazon durum badge
        let amzHtml = `<span class="bd bd-gy">${d.status||'?'}</span>`;
        if (d.idNotFound && !d.isCancelledSF)            amzHtml = `<span class="bd bd-o">⏳ ID Yok</span>`;
        else if (d.isCancelledSF || d.status?.includes('Cancel')) amzHtml = `<span class="bd bd-r">🚫 İptal</span>`;
        else if (d.deliveryOverdue)                       amzHtml = `<span class="bd bd-r">⏰ Gecikti</span>`;
        else if (d.isSellerRefunded)                      amzHtml = `<span class="bd bd-r">💸 Müşt.İade</span>`;
        else if (d.isBuyerRefunded)                       amzHtml = `<span class="bd bd-o">💰 AMZ İade</span>`;
        else if (d.status === 'Delivered')                amzHtml = `<span class="bd bd-b">Delivered</span>`;
        else if (d.status?.includes('Shipped'))           amzHtml = `<span class="bd bd-g">Shipped</span>`;
        else if (['Not Shipped','Preparing','Ordered'].includes(d.status)) amzHtml = `<span class="bd bd-o">${d.status}</span>`;
        else if (d.status?.includes('Diğer'))             amzHtml = `<span class="bd bd-p">${d.status}</span>`;
        else if (/Hata|Link|Login|Cancel|Sıraya/i.test(d.status||'')) amzHtml = `<span class="bd bd-r">${d.status}</span>`;

        // Takip no
        function getTrackUrl(tracking, cargoCompany, trackUrl) {
            if (!tracking) return null;
            if (trackUrl) return trackUrl;
            const co = (cargoCompany || '').toLowerCase();
            if (co.includes('asendia')) return `https://a1.asendiausa.com/tracking/?trackingnumber=${tracking}`;
            if (co.includes('apc'))     return `https://tracking.apc-pli.com/${tracking}`;
            if (co.includes('dhl'))     return `https://www.dhl.com/tr-en/home/tracking.html?tracking-id=${tracking}&submit=1`;
            if (co.includes('fedex'))   return `https://www.fedex.com/fedextrack/?trknbr=${tracking}`;
            if (co.includes('ups'))     return `https://www.ups.com/track?tracknum=${tracking}`;
            if (co.includes('epost') || co.includes('epg'))    return `https://portal.epgshipping.com/?tracknumber=${tracking}`;
            return null;
        }
        const trackLink = getTrackUrl(d.whTracking, d.cargoCompany, d.trackUrl);
        const trackHtml = d.whTracking
            ? `${trackLink
                ? `<a href="${trackLink}" target="_blank" style="font-family:monospace;font-size:11px;color:#1d4ed8;text-decoration:none;">${d.whTracking}</a>`
                : `<span style="font-family:monospace;font-size:11px;">${d.whTracking}</span>`}
               <button class="sf-copy-btn" onclick="navigator.clipboard.writeText('${d.whTracking}');this.textContent='✓';setTimeout(()=>this.textContent='Kopyala',1200)">Kopyala</button>`
            : '<span style="color:#94a3b8;">—</span>';

        // Kargo badge
        const co = (d.cargoCompany||'').toUpperCase();
        let cargoIcon = '📦';
        if (co.includes('ASENDIA')) cargoIcon='✈️';
        else if (co.includes('FEDEX')) cargoIcon='🟠';
        else if (co.includes('DHL'))   cargoIcon='🟡';
        else if (co.includes('UPS'))   cargoIcon='🟢';
        else if (co.includes('APC'))   cargoIcon='🔵';
        else if (co.includes('EVRI'))  cargoIcon='🟣';
        else if (co.includes('EPOST') || co.includes('EPG')) cargoIcon = '🌐';
        const cargoHtml = d.cargoCompany
            ? `<span style="font-size:11px;">${cargoIcon} ${d.cargoCompany}</span>`
            : '<span style="color:#94a3b8;">—</span>';

        // Depoda kaç gün
        let daysHtml = '<span style="color:#94a3b8;">—</span>';
        if (!d.isShipped && !d.sfDelivered && !d.whTrackStatus?.includes('Teslim') && d.status === 'Delivered') {
            const ts = d.deliveredToWarehouseAt || d.lastCheck || 0;
            if (ts) {
                const days = Math.floor((Date.now() - ts) / 86400000);
                daysHtml = `<span class="bd ${days>=7?'bd-r':days>=3?'bd-o':'bd-b'}">${days===0?'Bugün':days+' gün'}</span>`;
            }
        }

        // Son güncelleme
        const lastUpdate = d.lastCheck
            ? new Date(d.lastCheck).toLocaleTimeString('tr-TR', {hour:'2-digit',minute:'2-digit'})
            : '—';

        const sfOrderHtml = `<a href="https://panel.sellerflash.com/sellerOrder/${id}" target="_blank" style="font-family:monospace;font-size:11px;color:#1d4ed8;text-decoration:none;" title="SellerFlash'te aç">${id}</a>`;
        const buyerOrderHtml = (d.buyerOrderId && d.buyerOrderId !== '—')
            ? `<a href="https://www.amazon.com/your-orders/order-details?orderID=${d.buyerOrderId}&ref=ab_ppx_yo_dt_b_fed_order_details" target="_blank" style="font-family:monospace;font-size:11px;color:#c2410c;text-decoration:none;" title="Amazon'da aç">${d.buyerOrderId}</a>`
            : '<span style="color:#94a3b8;">—</span>';

        const asinHtml = d.asin
            ? `<a href="https://www.amazon.com.au/dp/${d.asin}" target="_blank" style="font-family:monospace;font-size:11px;color:#0369a1;text-decoration:none;" title="Amazon'da aç">${d.asin}</a>`
            : '<span style="color:#94a3b8;">—</span>';

        // Amazon takip no (buyerOrder'ın Amazon→depo takibi, TBA…)
        const amzTrackHtml = d.amazonTrackingId
            ? `<a href="https://parcelsapp.com/en/tracking/${d.amazonTrackingId}" target="_blank" style="font-family:monospace;font-size:11px;color:#c2410c;text-decoration:none;">${d.amazonTrackingId}</a>
               <button class="sf-copy-btn" onclick="navigator.clipboard.writeText('${d.amazonTrackingId}');this.textContent='✓';setTimeout(()=>this.textContent='Kopyala',1200)">Kopyala</button>`
            : '<span style="color:#94a3b8;">—</span>';

        const cells = [
            sfOrderHtml,
            asinHtml,
            buyerOrderHtml,
            amzHtml,
            amzTrackHtml,
            `<span style="font-size:11px;">${d.warehouse||'—'}</span>`,
            `<span style="font-size:11px;color:#64748b;">${d.warehouseId||'—'}</span>`,
            `<span style="font-size:11px;color:#64748b;">${d.shipmentId||'—'}</span>`,
            trackHtml,
            cargoHtml,
            `<span style="font-size:11px;color:#475569;">${d.whStatus||'—'}</span>`,
            `<span style="font-size:11px;">${d.whTrackStatus||'—'}</span>`,
            `<span style="font-size:11px;color:#64748b;">${d.exitDate||'—'}</span>`,
            daysHtml,
            `<span style="font-size:11px;color:#94a3b8;">${lastUpdate}</span>`,
        ];

        cells.forEach(html => {
            const td = document.createElement('td');
            td.innerHTML = html;
            row.appendChild(td);
        });

        return row;
    }

    // ─────────────────────────────────────────────
    // EXCEL EXPORT
    // ─────────────────────────────────────────────
    function exportToExcel() {
        const headers = ['SF Sipariş No','ASIN','Buyer Sipariş No','Amazon Durum','Amazon Takip','Depo','Depo No','Shipment ID','Takip No','Kargo','Depo Durumu','Teslimat Durumu','Çıkış Tarihi'];
        const rows = VS.data.map(([id, d]) => [
            id, d.asin||'', d.buyerOrderId||'', d.status||'', d.amazonTrackingId||'', d.warehouse||'', d.warehouseId||'',
            d.shipmentId||'', d.whTracking||'', d.cargoCompany||'',
            d.whStatus||'', d.whTrackStatus||'', d.exitDate||''
        ]);
        const csv = [headers, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
        const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `sellerflash_${new Date().toISOString().slice(0,10)}.csv`;
        a.click();
    }

    // ─────────────────────────────────────────────
    // AUTO REFRESH — Supabase DB'yi periyodik çek
    // ─────────────────────────────────────────────
    // 30 saniyede bir DB'yi yenile ve paneli güncelle
    setInterval(async () => {
        await pullData();
        renderTable();
        updateStats();
    }, 30 * 1000);

    // ─────────────────────────────────────────────
    // CSS
    // ─────────────────────────────────────────────
    function injectCSS() {
        const css = document.createElement('style');
        css.textContent = `
        #sf-fab{position:fixed;bottom:20px;right:20px;z-index:999998;background:#1e293b;color:#fff;
            border:none;padding:8px 14px;border-radius:20px;cursor:pointer;font-size:12px;
            font-weight:700;box-shadow:0 4px 12px rgba(0,0,0,.4);font-family:sans-serif;}
        #sf-fab:hover{background:#334155;}
        #sf-panel{position:fixed;top:10px;left:10px;right:10px;bottom:10px;z-index:999999;
            background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;
            display:flex;flex-direction:column;overflow:hidden;
            box-shadow:0 8px 32px rgba(0,0,0,.25);font-family:sans-serif;}
        #sf-hdr{display:flex;align-items:center;justify-content:space-between;
            padding:10px 16px;background:#1e293b;color:#fff;border-radius:12px 12px 0 0;flex-shrink:0;}
        #sf-logo{font-size:15px;font-weight:800;color:#38bdf8;}
        #sf-version{font-size:10px;color:#94a3b8;margin-top:2px;}
        #sf-storebar{display:flex;align-items:center;gap:8px;padding:6px 14px;
            background:#0f172a;border-bottom:1px solid #334155;flex-shrink:0;flex-wrap:wrap;}
        #sf-store-label{font-size:11px;color:#64748b;}
        #active-store-name{font-size:12px;font-weight:700;color:#38bdf8;}
        #sf-server-status{font-size:11px;padding:2px 8px;border-radius:10px;
            background:#166534;color:#bbf7d0;font-weight:600;}
        #sf-server-status.offline{background:#7f1d1d;color:#fca5a5;}
        #sf-stats{display:flex;gap:0;border-bottom:1px solid #e2e8f0;flex-shrink:0;overflow-x:auto;}
        .sf-st{padding:6px 12px;cursor:pointer;border-right:1px solid #e2e8f0;
            display:flex;flex-direction:column;align-items:center;min-width:60px;
            transition:background .15s;user-select:none;}
        .sf-st:hover,.sf-st.active{background:#eff6ff;}
        .sf-stv{font-size:16px;font-weight:800;color:#1e293b;}
        .sf-stv.g{color:#16a34a;} .sf-stv.b{color:#2563eb;} .sf-stv.o{color:#ea580c;}
        .sf-stv.r{color:#dc2626;} .sf-stv.p{color:#7c3aed;}
        .sf-stl{font-size:9px;color:#94a3b8;font-weight:600;white-space:nowrap;}
        #sf-bar{padding:4px 14px;font-size:11px;color:#475569;background:#f1f5f9;
            border-bottom:1px solid #e2e8f0;flex-shrink:0;}
        #sf-toolbar{display:flex;flex-wrap:wrap;gap:5px;padding:8px 12px;
            background:#fff;border-bottom:1px solid #e2e8f0;flex-shrink:0;}
        .sfb{padding:5px 10px;border:none;border-radius:6px;cursor:pointer;
            font-size:11px;font-weight:700;transition:opacity .15s;}
        .sfb:hover{opacity:.85;}
        .b-blue{background:#3b82f6;color:#fff;} .b-green{background:#16a34a;color:#fff;}
        .b-orange{background:#ea580c;color:#fff;} .b-red{background:#dc2626;color:#fff;}
        .b-gray{background:#e2e8f0;color:#475569;} .b-dark{background:#334155;color:#fff;}
        .b-purple{background:#7c3aed;color:#fff;} .sfb-sm{font-size:10px;padding:3px 7px;}
        .sf-sep{width:1px;background:#e2e8f0;margin:0 2px;}
        #sf-tw{flex:1;overflow-y:auto;overflow-x:auto;}
        #sf-t{width:100%;border-collapse:collapse;font-size:11px;}
        #sf-t th{background:#f8fafc;padding:6px 8px;text-align:left;font-size:10px;
            color:#64748b;border-bottom:2px solid #e2e8f0;white-space:nowrap;position:sticky;top:0;z-index:2;}
        #sf-t td{padding:5px 8px;border-bottom:1px solid #f1f5f9;vertical-align:middle;white-space:nowrap;}
        #sf-t tr:hover td{background:#f8fafc;}
        .row-delivered td{background:#f0fdf4!important;}
        .row-shipped td{background:#eff6ff!important;}
        .row-depot td{background:#fffbeb!important;}
        .row-alarm td{background:#fef2f2!important;}
        .row-seller-refunded td{background:#fef2f2!important;}
        .row-buyer-refunded td{background:#fff7ed!important;}
        .sf-selected td{background:#e0f2fe!important;}
        .sf-flt{width:90%;padding:2px 4px;font-size:10px;border:1px solid #e2e8f0;border-radius:3px;}
        .bd{display:inline-flex;align-items:center;padding:2px 7px;border-radius:4px;
            font-size:10.5px;font-weight:600;white-space:nowrap;}
        .bd-gy{background:#f1f5f9;color:#64748b;border:1px solid #e2e8f0;}
        .bd-g{background:#dcfce7;color:#15803d;border:1px solid #bbf7d0;}
        .bd-b{background:#eff6ff;color:#1d4ed8;border:1px solid #bfdbfe;}
        .bd-o{background:#fff7ed;color:#c2410c;border:1px solid #fed7aa;}
        .bd-r{background:#fef2f2;color:#b91c1c;border:1px solid #fecaca;}
        .bd-p{background:#faf5ff;color:#6d28d9;border:1px solid #ddd6fe;}
        .sf-copy-btn{padding:1px 5px;font-size:9px;background:#f1f5f9;border:1px solid #e2e8f0;
            border-radius:3px;cursor:pointer;margin-left:3px;}
        .sf-copy-btn:hover{background:#e2e8f0;}
        `;
        document.head.appendChild(css);
    }

    // ─────────────────────────────────────────────
    // UI OLUŞTUR
    // ─────────────────────────────────────────────
    function createUI() {
        injectCSS();

        // FAB butonu
        const fab = document.createElement('button');
        fab.id = 'sf-fab';
        fab.textContent = '⚡ SF Panel';
        fab.onclick = () => {
            const p = document.getElementById('sf-panel');
            p.style.display = p.style.display === 'none' ? 'flex' : 'none';
        };
        document.body.appendChild(fab);

        // Panel
        const panel = document.createElement('div');
        panel.id = 'sf-panel';
        panel.innerHTML = `
        <div id="sf-hdr">
            <div>
                <div id="sf-logo">⚡ SellerFlash</div>
                <div id="sf-version">Sunucu Modu v2.0 — Panel sadece görüntüler</div>
            </div>
            <div style="display:flex;align-items:center;gap:8px;">
                <span id="sf-server-status" class="offline">⏳ Sunucu kontrol ediliyor</span>
                <button class="sfb b-dark sfb-sm" onclick="document.getElementById('sf-panel').style.display='none'">✕</button>
            </div>
        </div>

        <div id="sf-storebar">
            <span id="sf-store-label">Mağaza:</span>
            <span id="active-store-name">Algılanıyor...</span>
            <span style="font-size:10px;color:#64748b;margin-left:8px;">Otomasyon sunucuda çalışıyor</span>
        </div>

        <div id="sf-stats">
            <div class="sf-st active" id="box-all">        <span id="st-total"          class="sf-stv">0</span><span class="sf-stl">Toplam</span></div>
            <div class="sf-st" id="box-amz">               <span id="st-amz"            class="sf-stv">0</span><span class="sf-stl">AMZ Bekl.</span></div>
            <div class="sf-st" id="box-other">             <span id="st-other"          class="sf-stv p">0</span><span class="sf-stl">Diğer Acc</span></div>
            <div class="sf-st" id="box-coming">            <span id="st-coming"         class="sf-stv o">0</span><span class="sf-stl">Yolda</span></div>
            <div class="sf-st" id="box-depot">             <span id="st-depot"          class="sf-stv b">0</span><span class="sf-stl">Depoda</span></div>
            <div class="sf-st" id="box-shipped">           <span id="st-shipped"        class="sf-stv g">0</span><span class="sf-stl">Kargoda</span></div>
            <div class="sf-st" id="box-delivered">         <span id="st-delivered"      class="sf-stv g">0</span><span class="sf-stl">Teslim</span></div>
            <div class="sf-st" id="box-alarm">             <span id="st-alarm"          class="sf-stv r">0</span><span class="sf-stl">🚨 Alarm</span></div>
            <div class="sf-st" id="box-seller-refunded">   <span id="st-seller-refunded" class="sf-stv r">0</span><span class="sf-stl">💸 Müşt.İade</span></div>
            <div class="sf-st" id="box-buyer-refunded">    <span id="st-buyer-refunded"  class="sf-stv o">0</span><span class="sf-stl">💰 AMZ İade</span></div>
            <div class="sf-st" id="box-nopv">              <span id="st-nopv"           class="sf-stv r">0</span><span class="sf-stl">Token Eksik</span></div>
        </div>

        <div id="sf-bar">Supabase'den veri yükleniyor...</div>

        <div id="sf-toolbar">
            <button class="sfb b-blue"   id="btn-refresh">🔄 Yenile</button>
            <button class="sfb b-gray sfb-sm" id="btn-show-hidden">👁 Gizlenenleri Göster</button>
            <button class="sfb b-red  sfb-sm" id="btn-hide-selected" style="display:none">🗑 Seçilenleri Gizle</button>
            <button class="sfb b-gray sfb-sm" id="btn-clear">🗑 DB Sıfırla</button>
            <div style="flex:1"></div>
            <button class="sfb b-green sfb-sm" id="btn-excel">Excel ↓</button>
            <button class="sfb sfb-sm" id="btn-cloud-sync" style="background:#6366f1;color:#fff;">☁️ Kaydet</button>
        </div>

        <div id="sf-tw">
            <table id="sf-t">
                <thead>
                <tr>
                    <th style="width:32px;"><input type="checkbox" id="sf-chk-all" style="cursor:pointer;width:14px;height:14px;accent-color:#3b82f6;"></th>
                    <th>SF Sipariş No</th><th>ASIN</th><th>Buyer Sipariş No</th><th>Amazon Durum</th>
                    <th>Amazon Takip</th>
                    <th>Depo</th><th>Depo No</th><th>Shipment ID</th><th>Takip No</th>
                    <th>Kargo</th><th>Depo Durumu</th><th>Teslimat Durumu</th>
                    <th>Çıkış Tarihi</th><th>Depoda</th><th>Güncelleme</th>
                </tr>
                <tr id="sf-filter-row">
                    <th><span onclick="clearFilters()" style="cursor:pointer;font-size:11px;color:#f97316;font-weight:900;">✕</span></th>
                    <th><input class="sf-flt" data-col="sfId"      placeholder="SF No…"    /></th>
                    <th><input class="sf-flt" data-col="asin"      placeholder="ASIN…"     /></th>
                    <th><input class="sf-flt" data-col="buyerId"   placeholder="Buyer No…" /></th>
                    <th><input class="sf-flt" data-col="status"    placeholder="Durum…"    /></th>
                    <th><input class="sf-flt" data-col="amzTrack"  placeholder="AMZ Takip…"/></th>
                    <th><input class="sf-flt" data-col="warehouse" placeholder="Depo…"     /></th>
                    <th><input class="sf-flt" data-col="depoNo"    placeholder="Depo No…"  /></th>
                    <th><input class="sf-flt" data-col="shipId"    placeholder="Shipment…" /></th>
                    <th><input class="sf-flt" data-col="tracking"  placeholder="Takip…"    /></th>
                    <th><input class="sf-flt" data-col="cargo"     placeholder="Kargo…"    /></th>
                    <th><input class="sf-flt" data-col="whStatus"  placeholder="Depo Dur…" /></th>
                    <th><input class="sf-flt" data-col="delivery"  placeholder="Teslimat…" /></th>
                    <th></th><th></th><th></th>
                </tr>
                </thead>
                <tbody id="sf-tbody"></tbody>
            </table>
        </div>`;
        panel.style.display = 'none';
        document.body.appendChild(panel);

        // ── Buton bağlamaları ──────────────────────────────────
        document.getElementById('btn-refresh').onclick = async () => {
            setBar('Yenileniyor...');
            await pullData();
            renderTable(); updateStats();
            setBar(`✅ ${Object.keys(DB).length} sipariş yüklendi.`);
        };

        document.getElementById('btn-excel').onclick = exportToExcel;

        document.getElementById('btn-cloud-sync').onclick = async () => {
            setBar('Kaydediliyor...');
            if (CURRENT_MKT_ID) await cloudPut(`DB_${CURRENT_MKT_ID}`, JSON.stringify(DB));
            setBar('✅ Kaydedildi.');
        };

        document.getElementById('btn-clear').onclick = async () => {
            if (!confirm('Tüm DB silinecek. Sunucu bir sonraki döngüde verileri yeniden çeker. Emin misin?')) return;
            DB = {}; saveDB(); renderTable(); updateStats();
            // LAST_FETCH sıfırla — sunucu hemen yeniden çeksin
            if (CURRENT_MKT_ID) {
                await cloudPut(`LAST_FETCH_${CURRENT_MKT_ID}`, '0');
                setBar('✅ DB sıfırlandı. Sunucu bir sonraki döngüde verileri yeniden çekecek.');
            }
        };

        document.getElementById('btn-hide-selected').onclick = () => {
            if (!SELECTED_ROWS.size) return;
            if (!confirm(`${SELECTED_ROWS.size} sipariş gizlenecek. Devam?`)) return;
            SELECTED_ROWS.forEach(id => HIDDEN_ORDERS.add(id));
            GM_setValue('SF_HIDDEN_ORDERS', JSON.stringify([...HIDDEN_ORDERS]));
            SELECTED_ROWS.clear();
            document.getElementById('btn-hide-selected').style.display = 'none';
            renderTable(); updateStats();
        };

        document.getElementById('btn-show-hidden').onclick = () => {
            HIDDEN_ORDERS.clear();
            GM_setValue('SF_HIDDEN_ORDERS', '[]');
            renderTable(); updateStats();
        };

        document.getElementById('sf-chk-all').onchange = e => {
            if (e.target.checked) VS.data.forEach(([id]) => SELECTED_ROWS.add(id));
            else SELECTED_ROWS.clear();
            document.getElementById('btn-hide-selected').style.display = SELECTED_ROWS.size ? 'inline-block' : 'none';
            renderTableDebounced();
        };

        // ── Filtre kutuları ────────────────────────────────────
        document.querySelectorAll('.sf-flt').forEach(input => {
            input.oninput = e => {
                TABLE_SEARCH[e.target.dataset.col] = e.target.value.trim().toLowerCase();
                renderTableDebounced();
            };
        });

        window.clearFilters = () => {
            TABLE_SEARCH = { sfId:'', asin:'', buyerId:'', status:'', amzTrack:'', warehouse:'', depoNo:'', shipId:'', tracking:'', cargo:'', whStatus:'', delivery:'' };
            document.querySelectorAll('.sf-flt').forEach(i => i.value = '');
            renderTableDebounced();
        };

        // ── İstatistik kutusu filtresi ─────────────────────────
        const filterMap = {
            'box-all': 'ALL', 'box-amz': 'AMZ', 'box-other': 'OTHER',
            'box-coming': 'COMING', 'box-depot': 'DEPOT', 'box-shipped': 'SHIPPED',
            'box-delivered': 'DELIVERED', 'box-alarm': 'ALARM',
            'box-seller-refunded': 'SELLER_REFUNDED', 'box-buyer-refunded': 'BUYER_REFUNDED',
            'box-nopv': 'NOPV'
        };
        document.querySelectorAll('.sf-st').forEach(box => {
            box.onclick = () => {
                document.querySelectorAll('.sf-st').forEach(b => b.classList.remove('active'));
                box.classList.add('active');
                CURRENT_FILTER = filterMap[box.id] || 'ALL';
                renderTableDebounced();
            };
        });
    }

    // ─────────────────────────────────────────────
    // SUNUCU DURUM KONTROLÜ
    // ─────────────────────────────────────────────
    async function checkServerStatus() {
        const el = document.getElementById('sf-server-status');
        if (!el) return;

        // Supabase'deki son güncelleme zamanına bakarak sunucunun aktif olup
        // olmadığını anlıyoruz — son 20 dakikada DB güncellenmiş mi?
        try {
            const res = await new Promise(resolve => {
                GM_xmlhttpRequest({
                    method: 'GET',
                    url: `${CLOUD.URL}/rest/v1/sf_store?key=eq.SERVER_HEARTBEAT&select=value,updated_at`,
                    headers: { 'apikey': CLOUD.APIKEY, 'Authorization': `Bearer ${CLOUD.APIKEY}` },
                    timeout: 5000,
                    onload: r => { try { resolve(JSON.parse(r.responseText)); } catch(e) { resolve(null); } },
                    onerror: () => resolve(null),
                    ontimeout: () => resolve(null),
                });
            });

            if (res && res[0]) {
                const updatedAt = new Date(res[0].updated_at).getTime();
                const ageMins = Math.floor((Date.now() - updatedAt) / 60000);
                if (ageMins < 20) {
                    el.textContent = `✅ Sunucu aktif (${ageMins}dk önce)`;
                    el.className = '';
                    el.style.cssText = 'font-size:11px;padding:2px 8px;border-radius:10px;background:#166534;color:#bbf7d0;font-weight:600;';
                } else {
                    el.textContent = `⚠️ Sunucu yanıt vermiyor (${ageMins}dk)`;
                    el.className = 'offline';
                    el.style.cssText = 'font-size:11px;padding:2px 8px;border-radius:10px;background:#7f1d1d;color:#fca5a5;font-weight:600;';
                }
            } else {
                el.textContent = '⚠️ Sunucu heartbeat yok';
                el.className = 'offline';
            }
        } catch(e) {
            el.textContent = '❌ Bağlantı hatası';
            el.className = 'offline';
        }
    }

    // ─────────────────────────────────────────────
    // BAŞLAT
    // ─────────────────────────────────────────────

    // MarketplaceId tespiti — önce localStorage'dan, yoksa kayıtlı değeri kullan
    const detectedMkt = detectMarketplaceId();
    if (detectedMkt) {
        CURRENT_MKT_ID = String(detectedMkt);
        GM_setValue('SF_LAST_MKT_ID', CURRENT_MKT_ID);
        console.log('[SF] MktId tespit edildi:', CURRENT_MKT_ID);
    } else {
        console.log('[SF] MktId tespit edilemedi, kayıtlı değer kullanılıyor:', CURRENT_MKT_ID);
    }

    // ─────────────────────────────────────────────
    // SF TOKEN KONSOL KONTROLÜ (Supabase'e yazmaz)
    // Admin-Token + tüm localStorage/sessionStorage taranır,
    // sadece CURRENT_MKT_ID ile eşleşen token konsola yazılır.
    // ─────────────────────────────────────────────
    (function logSFTokenForCurrentMkt() {
        if (!CURRENT_MKT_ID) return;

        function decodeTokenMktId(token) {
            // JWT ise payload'dan SF'nin marketplace claim'lerini çek
            try {
                const parts = token.split('.');
                if (parts.length === 3) {
                    const payload = JSON.parse(atob(parts[1].replace(/-/g,'+').replace(/_/g,'/')));
                    // SF token'ında asıl alan: SelectedMarketPlaceId veya selected_marketplace_id
                    const val =
                        payload['SelectedMarketPlaceId']      ||
                        payload['selected_marketplace_id']    ||
                        payload['marketplaceId']              ||
                        payload['mktId']                      ||
                        payload['MarketplaceId']              ||
                        payload['customerMarketPlaceId']      ||
                        null;
                    return val !== null ? String(val) : null;
                    // NOT: payload.sub kasıyla karıştırma — o kullanıcı UUID'si
                }
            } catch(e) {}
            return null;
        }

        function checkToken(label, token) {
            if (!token || token.length < 10) return;
            const mktInToken = decodeTokenMktId(token);

            if (mktInToken) {
                // JWT decode başarılı — mktId ile karşılaştır
                if (mktInToken === CURRENT_MKT_ID) {
                    console.log(`[SF] ✅ ${label} → MktId ${CURRENT_MKT_ID} ile EŞLEŞİYOR:`, token);
                } else {
                    console.log(`[SF] ❌ ${label} → MktId uyuşmuyor (token içinde: ${mktInToken}, beklenen: ${CURRENT_MKT_ID})`);
                }
            } else {
                // JWT decode edilemedi — token string içinde mktId geçiyor mu ara
                if (token.includes(CURRENT_MKT_ID)) {
                    console.log(`[SF] ✅ ${label} → String içinde MktId ${CURRENT_MKT_ID} bulundu:`, token);
                } else {
                    console.log(`[SF] ⚠️ ${label} → MktId doğrulanamadı (JWT decode yok, string eşleşmesi yok). Token:`, token.slice(0, 60) + '...');
                }
            }
        }

        // 1) Admin-Token (birincil aday)
        const adminToken = localStorage.getItem('Admin-Token');
        if (adminToken) checkToken('localStorage[Admin-Token]', adminToken);

        // 2) Tüm localStorage anahtarlarını tara — token benzeri değerleri bul
        const tokenKeywords = /token|auth|bearer|jwt/i;
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key === 'Admin-Token') continue; // zaten yukarıda işlendi
            if (tokenKeywords.test(key)) {
                const val = localStorage.getItem(key);
                if (val && val.length > 20) checkToken(`localStorage[${key}]`, val);
            }
        }

        // 3) sessionStorage da tara
        try {
            for (let i = 0; i < sessionStorage.length; i++) {
                const key = sessionStorage.key(i);
                if (tokenKeywords.test(key)) {
                    const val = sessionStorage.getItem(key);
                    if (val && val.length > 20) checkToken(`sessionStorage[${key}]`, val);
                }
            }
        } catch(e) {}

        console.log('[SF] Token taraması tamamlandı. MktId:', CURRENT_MKT_ID);
    })();

    // UI oluştur
    setTimeout(async () => {
        createUI();

        // Mağaza adını göster
        const storeName = getStoreName() || ACCOUNTS?.[0]?.name || CURRENT_MKT_ID || 'Bilinmiyor';
        const storeEl = document.getElementById('active-store-name');
        if (storeEl) storeEl.textContent = storeName;

        // Veri yükle
        setBar('Supabase\'den yükleniyor...');
        await pullData();
        renderTable();
        updateStats();
        setBar(`✅ ${Object.keys(DB).length} sipariş yüklendi.`);

        // Sunucu durumu
        await checkServerStatus();
        setInterval(checkServerStatus, 5 * 60 * 1000); // 5 dk'da bir kontrol

    }, 600);

})();