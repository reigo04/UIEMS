/* ═══════════════════════════════════════════════════════
   UICT — Frontend Application Logic
   ═══════════════════════════════════════════════════════ */

(() => {
    "use strict";

    // ── References ──
    const $ = (s, p = document) => p.querySelector(s);
    const $$ = (s, p = document) => [...p.querySelectorAll(s)];

    const loginView     = $("#login-view");
    const dashboardView = $("#dashboard-view");
    const loginForm     = $("#login-form");
    const loginError    = $("#login-error");
    const loginBtn      = $("#login-btn");
    const logoutBtn     = $("#logout-btn");
    const navUsername    = $("#navbar-username");

    // Tab & Panel state
    const tabs    = $$(".tab");
    const panels  = $$(".panel");
    let activeTab = "overview";

    // Equipment state
    let currentPage = 1;
    let currentSort = "created_at";
    let currentSortDir = "desc";
    let filters = {};
    let editingId = null;
    let deleteTargetId = null;

    // ── API Helper ──
    async function api(url, opts = {}) {
        const defaults = {
            headers: { "Content-Type": "application/json" },
            credentials: "same-origin",
        };
        const res = await fetch(url, { ...defaults, ...opts });
        if (res.status === 401 && !url.includes("/login") && !url.includes("/auth/check")) {
            showView("login");
            return null;
        }
        const contentType = res.headers.get("content-type") || "";
        if (contentType.includes("application/json")) {
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Request failed");
            return data;
        }
        return res;
    }

    // ── Toast ──
    function toast(message, type = "info") {
        const container = $("#toast-container");
        const el = document.createElement("div");
        el.className = `toast ${type}`;
        el.textContent = message;
        container.appendChild(el);
        setTimeout(() => {
            el.classList.add("fade-out");
            setTimeout(() => el.remove(), 300);
        }, 3500);
    }

    // ── View Switching ──
    function showView(name) {
        loginView.classList.toggle("active", name === "login");
        dashboardView.classList.toggle("active", name === "dashboard");
        if (name === "dashboard") {
            loadDashboard();
        }
    }

    // ── Tab Switching ──
    function switchTab(tabName) {
        activeTab = tabName;
        tabs.forEach(t => t.classList.toggle("active", t.dataset.tab === tabName));
        panels.forEach(p => p.classList.toggle("active", p.id === `panel-${tabName}`));

        if (tabName === "overview") loadDashboard();
        if (tabName === "equipment") loadEquipment();
        if (tabName === "reports") loadReportFilters();
    }

    tabs.forEach(t => t.addEventListener("click", () => switchTab(t.dataset.tab)));

    // ═══════════════════════════════════════
    // AUTH
    // ═══════════════════════════════════════

    loginForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const username = $("#login-username").value.trim();
        const password = $("#login-password").value;
        loginError.hidden = true;
        setBtnLoading(loginBtn, true);

        try {
            const data = await api("/api/login", {
                method: "POST",
                body: JSON.stringify({ username, password }),
            });
            if (data) {
                navUsername.textContent = data.username || "Admin";
                showView("dashboard");
                toast("Welcome back!", "success");
            }
        } catch (err) {
            loginError.textContent = err.message;
            loginError.hidden = false;
        } finally {
            setBtnLoading(loginBtn, false);
        }
    });

    logoutBtn.addEventListener("click", async () => {
        await api("/api/logout", { method: "POST" });
        showView("login");
        toast("Signed out", "info");
    });

    // Check auth on load
    async function checkAuth() {
        try {
            const data = await api("/api/auth/check");
            if (data && data.authenticated) {
                navUsername.textContent = data.username || "Admin";
                showView("dashboard");
            } else {
                showView("login");
            }
        } catch {
            showView("login");
        }
    }

    // ═══════════════════════════════════════
    // DASHBOARD / OVERVIEW
    // ═══════════════════════════════════════

    async function loadDashboard() {
        try {
            const stats = await api("/api/dashboard/stats");
            if (!stats) return;

            $("#stat-total-value").textContent = stats.total_equipment;
            $("#stat-types-value").textContent = stats.by_type.length;
            $("#stat-locations-value").textContent = stats.by_location.length;
            $("#stat-brands-value").textContent = stats.by_brand.length;

            renderBarChart("chart-types", stats.by_type, "type");
            renderBarChart("chart-locations", stats.by_location, "location");
            renderRecentTable(stats.recent);
        } catch (err) {
            console.error("Dashboard load error:", err);
        }
    }

    function renderBarChart(containerId, data, cssClass) {
        const container = $(`#${containerId}`);
        if (!data.length) {
            container.innerHTML = '<div class="chart-empty">No data yet</div>';
            return;
        }
        const max = Math.max(...data.map(d => d.count));
        container.innerHTML = data.map(d => {
            const pct = max > 0 ? Math.max((d.count / max) * 100, 8) : 0;
            return `<div class="bar-row">
                <span class="bar-label" title="${esc(d.label)}">${esc(d.label)}</span>
                <div class="bar-track">
                    <div class="bar-fill ${cssClass}" style="width:${pct}%">${d.count}</div>
                </div>
            </div>`;
        }).join("");
    }

    function renderRecentTable(items) {
        const tbody = $("#recent-table-body");
        if (!items.length) {
            tbody.innerHTML = '<tr><td colspan="7" class="table-empty">No records yet</td></tr>';
            return;
        }
        tbody.innerHTML = items.map(eq => `<tr>
            <td>${esc(eq.equipment_type)}</td>
            <td>${esc(eq.brand)}</td>
            <td>${esc(eq.model)}</td>
            <td>${esc(eq.serial_number)}</td>
            <td>${esc(eq.mr_to)}</td>
            <td>${esc(eq.location)}</td>
            <td>${formatDate(eq.date_unserviceable)}</td>
        </tr>`).join("");
    }

    // ═══════════════════════════════════════
    // EQUIPMENT LIST
    // ═══════════════════════════════════════

    async function loadEquipment() {
        const params = new URLSearchParams();
        params.set("page", currentPage);
        params.set("per_page", 15);
        params.set("sort_by", currentSort);
        params.set("sort_dir", currentSortDir);

        const search = $("#search-input").value.trim();
        if (search) params.set("search", search);

        const fType = $("#filter-type").value;
        const fBrand = $("#filter-brand").value;
        const fLoc = $("#filter-location").value;
        const fMR = $("#filter-mr").value;
        if (fType) params.set("equipment_type", fType);
        if (fBrand) params.set("brand", fBrand);
        if (fLoc) params.set("location", fLoc);
        if (fMR) params.set("mr_to", fMR);

        try {
            const data = await api(`/api/equipment?${params}`);
            if (!data) return;
            renderEquipmentTable(data.items);
            renderPagination(data);
        } catch (err) {
            console.error("Equipment load error:", err);
        }
    }

    function renderEquipmentTable(items) {
        const tbody = $("#equipment-table-body");
        if (!items.length) {
            tbody.innerHTML = '<tr><td colspan="8" class="table-empty">No equipment found</td></tr>';
            return;
        }
        tbody.innerHTML = items.map(eq => `<tr>
            <td>${esc(eq.equipment_type)}</td>
            <td>${esc(eq.brand)}</td>
            <td>${esc(eq.model)}</td>
            <td>${esc(eq.serial_number)}</td>
            <td>${esc(eq.mr_to)}</td>
            <td>${formatDate(eq.date_unserviceable)}</td>
            <td>${esc(eq.location)}</td>
            <td>
                <div class="td-actions">
                    <button class="btn-icon edit" title="Edit" onclick="UICT.editItem(${eq.id})">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    </button>
                    <button class="btn-icon delete" title="Delete" onclick="UICT.deleteItem(${eq.id}, '${esc(eq.serial_number)}')">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                    </button>
                </div>
            </td>
        </tr>`).join("");
    }

    function renderPagination(data) {
        const el = $("#pagination");
        if (data.pages <= 1) { el.innerHTML = ""; return; }

        let html = `<button class="page-btn" ${data.page <= 1 ? "disabled" : ""} onclick="UICT.goPage(${data.page - 1})">‹</button>`;

        const start = Math.max(1, data.page - 2);
        const end = Math.min(data.pages, data.page + 2);

        if (start > 1) {
            html += `<button class="page-btn" onclick="UICT.goPage(1)">1</button>`;
            if (start > 2) html += `<span style="color:var(--text-muted);padding:0 4px">...</span>`;
        }
        for (let i = start; i <= end; i++) {
            html += `<button class="page-btn ${i === data.page ? "active" : ""}" onclick="UICT.goPage(${i})">${i}</button>`;
        }
        if (end < data.pages) {
            if (end < data.pages - 1) html += `<span style="color:var(--text-muted);padding:0 4px">...</span>`;
            html += `<button class="page-btn" onclick="UICT.goPage(${data.pages})">${data.pages}</button>`;
        }

        html += `<button class="page-btn" ${data.page >= data.pages ? "disabled" : ""} onclick="UICT.goPage(${data.page + 1})">›</button>`;
        el.innerHTML = html;
    }

    // Sorting
    $$(".th-sortable").forEach(th => {
        th.addEventListener("click", () => {
            const col = th.dataset.sort;
            if (currentSort === col) {
                currentSortDir = currentSortDir === "asc" ? "desc" : "asc";
            } else {
                currentSort = col;
                currentSortDir = "asc";
            }
            $$(".th-sortable").forEach(t => t.classList.remove("sort-asc", "sort-desc"));
            th.classList.add(currentSortDir === "asc" ? "sort-asc" : "sort-desc");
            currentPage = 1;
            loadEquipment();
        });
    });

    // Search debounce
    let searchTimer;
    $("#search-input").addEventListener("input", () => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => { currentPage = 1; loadEquipment(); }, 350);
    });

    // Filter dropdowns
    ["filter-type", "filter-brand", "filter-location", "filter-mr"].forEach(id => {
        $(`#${id}`).addEventListener("change", () => { currentPage = 1; loadEquipment(); });
    });

    // Clear filters
    $("#btn-clear-filters").addEventListener("click", () => {
        $("#search-input").value = "";
        $("#filter-type").value = "";
        $("#filter-brand").value = "";
        $("#filter-location").value = "";
        $("#filter-mr").value = "";
        currentPage = 1;
        loadEquipment();
    });

    // Go to add modal
    $("#btn-goto-add").addEventListener("click", () => prepareAddForm());

    const equipmentModalOverlay = $("#equipment-modal-overlay");
    function openEquipmentModal() {
        equipmentModalOverlay.classList.add("visible");
    }
    function closeEquipmentModal() {
        equipmentModalOverlay.classList.remove("visible");
        editingId = null;
    }
    $("#equipment-modal-close").addEventListener("click", closeEquipmentModal);
    equipmentModalOverlay.addEventListener("click", (e) => {
        if (e.target === equipmentModalOverlay) closeEquipmentModal();
    });

    // Load filter dropdown options
    async function loadFilterOptions() {
        try {
            const data = await api("/api/equipment/filters");
            if (!data) return;
            populateSelect("#filter-type", data.equipment_types, "All Types");
            populateSelect("#filter-brand", data.brands, "All Brands");
            populateSelect("#filter-location", data.locations, "All Locations");
            populateSelect("#filter-mr", data.people, "All Personnel");

            // Also populate report filters
            populateSelect("#report-csv-filter-type", data.equipment_types, "All Types");
            populateSelect("#report-csv-filter-location", data.locations, "All Locations");
            populateSelect("#report-pdf-filter-type", data.equipment_types, "All Types");
            populateSelect("#report-pdf-filter-location", data.locations, "All Locations");

            // Populate datalists for add form
            populateDatalist("#type-suggestions", data.equipment_types);
            populateDatalist("#brand-suggestions", data.brands);
            populateDatalist("#loc-suggestions", data.locations);
            populateDatalist("#mr-suggestions", data.people);
        } catch (err) {
            console.error("Filter options error:", err);
        }
    }

    function populateSelect(sel, items, defaultLabel) {
        const el = $(sel);
        const current = el.value;
        el.innerHTML = `<option value="">${defaultLabel}</option>` +
            items.map(i => `<option value="${esc(i)}">${esc(i)}</option>`).join("");
        el.value = current;
    }

    function populateDatalist(sel, items) {
        const el = $(sel);
        el.innerHTML = items.map(i => `<option value="${esc(i)}">`).join("");
    }

    // ═══════════════════════════════════════
    // EQUIPMENT FORM (ADD / EDIT)
    // ═══════════════════════════════════════

    function prepareAddForm() {
        editingId = null;
        $("#form-title").textContent = "Add New Equipment";
        $("#btn-form-submit .btn-text").textContent = "Save Equipment";
        $("#equipment-form").reset();
        $("#eq-id").value = "";
        $("#form-error").hidden = true;
        openEquipmentModal();
    }

    async function loadEditForm(id) {
        try {
            const eq = await api(`/api/equipment/${id}`);
            if (!eq) return;
            editingId = id;
            $("#form-title").textContent = "Edit Equipment";
            $("#btn-form-submit .btn-text").textContent = "Update Equipment";
            $("#eq-id").value = eq.id;
            $("#eq-type").value = eq.equipment_type;
            $("#eq-brand").value = eq.brand;
            $("#eq-model").value = eq.model;
            $("#eq-serial").value = eq.serial_number;
            $("#eq-mr").value = eq.mr_to;
            $("#eq-date").value = eq.date_unserviceable;
            $("#eq-location").value = eq.location;
            $("#eq-remarks").value = eq.remarks || "";
            openEquipmentModal();
        } catch (err) {
            toast(err.message, "error");
        }
    }

    $("#equipment-form").addEventListener("submit", async (e) => {
        e.preventDefault();
        const submitBtn = $("#btn-form-submit");
        const errorEl = $("#form-error");
        errorEl.hidden = true;
        setBtnLoading(submitBtn, true);

        const payload = {
            equipment_type: $("#eq-type").value.trim(),
            brand: $("#eq-brand").value.trim(),
            model: $("#eq-model").value.trim(),
            serial_number: $("#eq-serial").value.trim(),
            mr_to: $("#eq-mr").value.trim(),
            date_unserviceable: $("#eq-date").value,
            location: $("#eq-location").value.trim(),
            remarks: $("#eq-remarks").value.trim(),
        };

        try {
            if (editingId) {
                await api(`/api/equipment/${editingId}`, {
                    method: "PUT",
                    body: JSON.stringify(payload),
                });
                toast("Equipment updated successfully!", "success");
            } else {
                await api("/api/equipment", {
                    method: "POST",
                    body: JSON.stringify(payload),
                });
                toast("Equipment added successfully!", "success");
            }
            editingId = null;
            loadFilterOptions();
            closeEquipmentModal();
            if (activeTab === "equipment") loadEquipment();
        } catch (err) {
            errorEl.textContent = err.message;
            errorEl.hidden = false;
        } finally {
            setBtnLoading(submitBtn, false);
        }
    });

    $("#btn-form-cancel").addEventListener("click", () => {
        closeEquipmentModal();
    });

    // ═══════════════════════════════════════
    // DELETE MODAL
    // ═══════════════════════════════════════

    const modalOverlay = $("#modal-overlay");
    const modalTitle   = $("#modal-title");
    const modalBody    = $("#modal-body");
    const modalConfirm = $("#modal-confirm");

    function openDeleteModal(id, serial) {
        deleteTargetId = id;
        modalTitle.textContent = "Delete Equipment";
        modalBody.innerHTML = `Are you sure you want to delete equipment with serial number <strong>${esc(serial)}</strong>? This action cannot be undone.`;
        modalOverlay.classList.add("visible");
    }

    function closeModal() {
        modalOverlay.classList.remove("visible");
        deleteTargetId = null;
    }

    $("#modal-close").addEventListener("click", closeModal);
    $("#modal-cancel").addEventListener("click", closeModal);
    modalOverlay.addEventListener("click", (e) => {
        if (e.target === modalOverlay) closeModal();
    });

    modalConfirm.addEventListener("click", async () => {
        if (!deleteTargetId) return;
        try {
            await api(`/api/equipment/${deleteTargetId}`, { method: "DELETE" });
            toast("Equipment deleted", "success");
            closeModal();
            loadFilterOptions();
            loadEquipment();
        } catch (err) {
            toast(err.message, "error");
        }
    });

    // ═══════════════════════════════════════
    // REPORTS
    // ═══════════════════════════════════════

    function loadReportFilters() {
        loadFilterOptions();
    }

    function buildExportParams(prefix) {
        const params = new URLSearchParams();
        const type = $(`#${prefix}-filter-type`).value;
        const loc  = $(`#${prefix}-filter-location`).value;
        const mr   = $(`#${prefix}-filter-mr`).value.trim();
        if (type) params.set("equipment_type", type);
        if (loc)  params.set("location", loc);
        if (mr)   params.set("mr_to", mr);
        return params.toString();
    }

    $("#btn-export-csv").addEventListener("click", () => {
        const qs = buildExportParams("report-csv");
        window.location.href = `/api/equipment/export/csv${qs ? "?" + qs : ""}`;
        toast("Downloading CSV report...", "info");
    });

    $("#btn-export-pdf").addEventListener("click", () => {
        const qs = buildExportParams("report-pdf");
        window.location.href = `/api/equipment/export/pdf${qs ? "?" + qs : ""}`;
        toast("Generating PDF report...", "info");
    });

    // ═══════════════════════════════════════
    // GLOBAL HELPERS
    // ═══════════════════════════════════════

    function esc(str) {
        if (!str) return "";
        const div = document.createElement("div");
        div.textContent = str;
        return div.innerHTML;
    }

    function formatDate(iso) {
        if (!iso) return "—";
        const d = new Date(iso + "T00:00:00");
        return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
    }

    function setBtnLoading(btn, loading) {
        const text = $(".btn-text", btn);
        const loader = $(".btn-loader", btn);
        if (text) text.hidden = loading;
        if (loader) loader.hidden = !loading;
        btn.disabled = loading;
    }

    // ═══════════════════════════════════════
    // IMPORT EXCEL MODAL
    // ═══════════════════════════════════════

    const importOverlay   = $("#import-modal-overlay");
    const importDropzone  = $("#import-dropzone");
    const importFileInput = $("#import-file-input");
    const importFileLabel = $("#import-file-label");
    const importUploadBtn = $("#import-upload-btn");
    const importResult    = $("#import-result");
    let importFile = null;

    function openImportModal() {
        importFile = null;
        importFileInput.value = "";
        importFileLabel.textContent = "Drag & drop or click to select a file";
        importDropzone.classList.remove("has-file");
        importUploadBtn.disabled = true;
        importResult.hidden = true;
        importResult.innerHTML = "";
        importOverlay.classList.add("visible");
    }

    function closeImportModal() {
        importOverlay.classList.remove("visible");
    }

    $("#btn-import-excel").addEventListener("click", openImportModal);
    $("#import-modal-close").addEventListener("click", closeImportModal);
    $("#import-modal-cancel").addEventListener("click", closeImportModal);
    importOverlay.addEventListener("click", (e) => {
        if (e.target === importOverlay) closeImportModal();
    });

    // Click to select file
    importDropzone.addEventListener("click", () => importFileInput.click());

    // Drag & drop
    importDropzone.addEventListener("dragover", (e) => {
        e.preventDefault();
        importDropzone.classList.add("drag-over");
    });
    importDropzone.addEventListener("dragleave", () => {
        importDropzone.classList.remove("drag-over");
    });
    importDropzone.addEventListener("drop", (e) => {
        e.preventDefault();
        importDropzone.classList.remove("drag-over");
        const files = e.dataTransfer.files;
        if (files.length && files[0].name.toLowerCase().endsWith(".xlsx")) {
            setImportFile(files[0]);
        } else {
            toast("Only .xlsx files are supported", "error");
        }
    });

    importFileInput.addEventListener("change", () => {
        if (importFileInput.files.length) {
            setImportFile(importFileInput.files[0]);
        }
    });

    function setImportFile(file) {
        importFile = file;
        importFileLabel.textContent = file.name;
        importDropzone.classList.add("has-file");
        importUploadBtn.disabled = false;
        importResult.hidden = true;
    }

    // Upload
    importUploadBtn.addEventListener("click", async () => {
        if (!importFile) return;
        setBtnLoading(importUploadBtn, true);
        importResult.hidden = true;

        const formData = new FormData();
        formData.append("file", importFile);

        try {
            const res = await fetch("/api/equipment/import", {
                method: "POST",
                body: formData,
                credentials: "same-origin",
            });
            const data = await res.json();

            if (!res.ok) {
                importResult.innerHTML = `<div class="import-result-box error">${esc(data.error || "Import failed")}</div>`;
                importResult.hidden = false;
                toast(data.error || "Import failed", "error");
            } else {
                let html = `<div class="import-result-box success"><strong>${esc(data.message)}</strong>`;
                if (data.errors && data.errors.length) {
                    html += `<br><br><strong>Warnings:</strong><br>` + data.errors.map(e => esc(e)).join("<br>");
                }
                html += `</div>`;
                importResult.innerHTML = html;
                importResult.hidden = false;
                toast(data.message, "success");

                // Refresh data
                loadFilterOptions();
                if (activeTab === "equipment") loadEquipment();
            }
        } catch (err) {
            importResult.innerHTML = `<div class="import-result-box error">Network error: ${esc(err.message)}</div>`;
            importResult.hidden = false;
            toast("Import failed", "error");
        } finally {
            setBtnLoading(importUploadBtn, false);
        }
    });

    // ── Public API for inline onclick handlers ──
    window.UICT = {
        editItem: (id) => loadEditForm(id),
        deleteItem: (id, serial) => openDeleteModal(id, serial),
        goPage: (page) => { currentPage = page; loadEquipment(); },
    };

    // ── Boot ──
    checkAuth().then(() => loadFilterOptions());

})();
