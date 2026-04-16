import React, { useState } from 'react';
import {
    UserPlus,
    Users,
    ChevronRight,
    LogOut,
    LayoutDashboard,
    RefreshCw,
    Edit2,
    Trash2,
    Loader2
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import conqueLogo from "@/assets/conque.png";

const AdminDashboard: React.FC = () => {
    const { user, isAuthenticated, logout } = useAuth();
    const navigate = useNavigate();
    const [isSubmitting, setIsSubmitting] = useState(false);

    React.useEffect(() => {
        if (!isAuthenticated) {
            navigate('/login');
        } else if (user?.role !== 'SUPER_ADMIN') {
            navigate('/dashboard');
        }
    }, [isAuthenticated, user, navigate]);

    const [userForm, setUserForm] = useState({
        organization: '',
        email: '',
        password: '',
        appLimit: 5,
        deviceLimit: 10,
        role: 'ADMIN' as 'ADMIN' | 'USER',
        apps: [
            {
                name: '',
                manual_id: '',
                devices: [{ name: '', device_id: '', version: '' }]
            }
        ]
    });

    const [activeTab, setActiveTab] = useState<'onboarding' | 'users'>('onboarding');
    const [users, setUsers] = useState<any[]>([]);
    const [isLoadingUsers, setIsLoadingUsers] = useState(false);
    const [editingUser, setEditingUser] = useState<any | null>(null);
    const [editForm, setEditForm] = useState({
        email: '',
        password: '',
        appLimit: 0,
        deviceLimit: 0,
    });

    // Drill-down State
    const [expandedUser, setExpandedUser] = useState<string | null>(null);
    const [expandedApp, setExpandedApp] = useState<string | null>(null);
    const [userApps, setUserApps] = useState<any[]>([]);
    const [appDevices, setAppDevices] = useState<any[]>([]);
    const [isLoadingDrillDown, setIsLoadingDrillDown] = useState(false);

    // UI Refinement States
    const [isProvisioningExpanded, setIsProvisioningExpanded] = useState(false);
    const [addingAppToUser, setAddingAppToUser] = useState<{ userId: string, customerId: string } | null>(null);
    const [newAppForm, setNewAppForm] = useState({
        name: '',
        manual_id: '',
        devices: [{ name: '', device_id: '', version: '' }]
    });

    // App Edit/Delete States
    const [editingApp, setEditingApp] = useState<any | null>(null);
    const [editAppForm, setEditAppForm] = useState({ name: '', manual_id: '' });

    // Device Edit/Delete States
    const [editingDevice, setEditingDevice] = useState<any | null>(null);
    const [editDeviceForm, setEditDeviceForm] = useState({ name: '', device_id_string: '', version: '' });

    // Add Device Modal State
    const [addingDeviceToApp, setAddingDeviceToApp] = useState<{ appId: string; customerId: string } | null>(null);
    const [newDeviceForm, setNewDeviceForm] = useState({ name: '', device_id: '', version: '' });

    const BASE_URL = '/fms-api';

    const fetchWithAuth = async (endpoint: string, options: RequestInit = {}) => {
        const response = await fetch(`${BASE_URL}${endpoint}`, {
            ...options,
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                ...options.headers,
            },
            credentials: 'include',
        });
        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.error || `Error: ${response.status} ${response.statusText}`);
        }
        return response.json();
    };

    const handleCreateAccount = async () => {
        if (!userForm.organization || !userForm.email || !userForm.password) {
            alert("Please fill all required fields (Organization, Username, Password).");
            return;
        }

        setIsSubmitting(true);
        try {
            console.log('Starting unified user creation...');

            await fetchWithAuth('/api/admin/onboard', {
                method: 'POST',
                body: JSON.stringify({
                    organization: userForm.organization,
                    email: userForm.email,
                    password: userForm.password,
                    app_limit: userForm.appLimit,
                    device_limit: userForm.deviceLimit,
                    role: userForm.role,
                    apps: userForm.apps
                })
            });

            alert('User profile and hierarchical configurations created successfully!');
            setUserForm({
                organization: '',
                email: '',
                password: '',
                appLimit: 5,
                deviceLimit: 10,
                role: 'ADMIN',
                apps: [{ name: '', manual_id: '', devices: [{ name: '', device_id: '', version: '' }] }]
            });
        } catch (err: any) {
            alert(`Process Failed: ${err.message}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    const fetchUsers = async () => {
        setIsLoadingUsers(true);
        try {
            const data = await fetchWithAuth('/api/users');
            setUsers(data);
        } catch (err: any) {
            console.error('Failed to fetch users:', err);
        } finally {
            setIsLoadingUsers(false);
        }
    };

    React.useEffect(() => {
        if (activeTab === 'users') {
            fetchUsers();
        }
    }, [activeTab]);

    const handleStartEdit = async (user: any) => {
        console.log('Starting edit for user:', user);
        if (!user.customer_id) {
            alert('Cannot edit: User has no associated organization ID.');
            return;
        }
        try {
            const customer = await fetchWithAuth(`/api/customers/${user.customer_id}`);
            setEditingUser(user);
            setEditForm({
                email: user.email || '',
                password: '',
                appLimit: customer.app_limit || 0,
                deviceLimit: customer.device_limit || 0,
            });
        } catch (err: any) {
            alert(`Failed to fetch details: ${err.message}`);
        }
    };

    const handleDeleteUser = async (userId: string) => {
        if (!confirm(`Are you sure you want to delete this user?`)) return;
        setIsLoadingUsers(true);
        try {
            await fetchWithAuth(`/api/users/${userId}`, { method: 'DELETE' });
            fetchUsers();
        } catch (err: any) {
            alert(`Delete failed: ${err.message}`);
        } finally {
            setIsLoadingUsers(false);
        }
    };

    const handleSaveEdit = async () => {
        if (!editingUser) return;
        setIsSubmitting(true);
        try {
            await fetchWithAuth('/api/admin/update-user', {
                method: 'POST',
                body: JSON.stringify({
                    user_id: editingUser._id,
                    customer_id: editingUser.customer_id,
                    email: editForm.email,
                    password: editForm.password || undefined,
                    app_limit: editForm.appLimit,
                    device_limit: editForm.deviceLimit,
                })
            });
            alert('User profile updated successfully!');
            setEditingUser(null);
            fetchUsers();
        } catch (err: any) {
            alert(`Update Failed: ${err.message}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleAddApp = (customerId: string) => {
        setAddingAppToUser({ userId: expandedUser!, customerId });
        setNewAppForm({
            name: '',
            manual_id: '',
            devices: [{ name: '', device_id: '', version: '' }]
        });
    };

    const handleSaveNewApp = async () => {
        if (!addingAppToUser || !newAppForm.name) {
            alert("Application Name is required.");
            return;
        }
        setIsSubmitting(true);
        try {
            // We use the same onboard-style logic but just for this app
            // We can call /api/applications and then /api/devices in loop
            const appData = await fetchWithAuth('/api/applications', {
                method: 'POST',
                body: JSON.stringify({
                    name: newAppForm.name,
                    manual_id: newAppForm.manual_id,
                    customer_id: addingAppToUser.customerId
                })
            });

            for (const dev of newAppForm.devices) {
                if (!dev.name || !dev.device_id) continue;
                await fetchWithAuth('/api/devices', {
                    method: 'POST',
                    body: JSON.stringify({
                        name: dev.name,
                        device_id_string: dev.device_id,
                        version: dev.version,
                        application_id: appData._id,
                        customer_id: addingAppToUser.customerId,
                        status: 'PROVISIONED'
                    })
                });
            }

            alert("Application and devices added successfully!");
            setAddingAppToUser(null);
            // Refresh apps for the current user
            const apps = await fetchWithAuth(`/api/applications?customer_id=${addingAppToUser.customerId}`);
            setUserApps(apps);
        } catch (err: any) {
            alert(`Failed to add app: ${err.message}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleAddDevice = (appId: string, customerId: string) => {
        setAddingDeviceToApp({ appId, customerId });
        setNewDeviceForm({ name: '', device_id: '', version: '' });
    };

    const handleSaveNewDevice = async () => {
        if (!addingDeviceToApp || !newDeviceForm.name || !newDeviceForm.device_id) {
            alert("Device Name and Device ID are required.");
            return;
        }
        setIsSubmitting(true);
        try {
            await fetchWithAuth('/api/devices', {
                method: 'POST',
                body: JSON.stringify({
                    name: newDeviceForm.name,
                    device_id_string: newDeviceForm.device_id,
                    version: newDeviceForm.version,
                    application_id: addingDeviceToApp.appId,
                    customer_id: addingDeviceToApp.customerId,
                    status: 'PROVISIONED'
                })
            });
            const { appId } = addingDeviceToApp;
            setAddingDeviceToApp(null);
            const devices = await fetchWithAuth(`/api/devices?application_id=${appId}`);
            setAppDevices(devices);
        } catch (err: any) {
            alert(`Failed to add device: ${err.message}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    // --- App Edit/Delete Handlers ---
    const handleStartEditApp = (app: any) => {
        setEditingApp(app);
        setEditAppForm({ name: app.name || '', manual_id: app.manual_id || '' });
    };

    const handleSaveEditApp = async () => {
        if (!editingApp || !editAppForm.name) return;
        setIsSubmitting(true);
        try {
            await fetchWithAuth(`/api/applications/${editingApp._id}`, {
                method: 'PUT',
                body: JSON.stringify(editAppForm)
            });
            setEditingApp(null);
            // Refresh apps for current user
            if (expandedUser) {
                const user = users.find(u => u._id === expandedUser);
                if (user) {
                    const apps = await fetchWithAuth(`/api/applications?customer_id=${user.customer_id}`);
                    setUserApps(apps);
                }
            }
        } catch (err: any) {
            alert(`Failed to update app: ${err.message}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDeleteApp = async (appId: string) => {
        if (!confirm("Are you sure you want to delete this application and all its devices?")) return;
        setIsLoadingDrillDown(true);
        try {
            await fetchWithAuth(`/api/applications/${appId}`, { method: 'DELETE' });
            if (expandedApp === appId) {
                setExpandedApp(null);
                setAppDevices([]);
            }
            if (expandedUser) {
                const user = users.find(u => u._id === expandedUser);
                if (user) {
                    const apps = await fetchWithAuth(`/api/applications?customer_id=${user.customer_id}`);
                    setUserApps(apps);
                }
            }
        } catch (err: any) {
            alert(`Delete failed: ${err.message}`);
        } finally {
            setIsLoadingDrillDown(false);
        }
    };

    // --- Device Edit/Delete Handlers ---
    const handleStartEditDevice = (device: any) => {
        setEditingDevice(device);
        setEditDeviceForm({
            name: device.name || '',
            device_id_string: device.device_id_string || '',
            version: device.version || ''
        });
    };

    const handleSaveEditDevice = async () => {
        if (!editingDevice || !editDeviceForm.name) return;
        setIsSubmitting(true);
        try {
            await fetchWithAuth(`/api/devices/${editingDevice._id}`, {
                method: 'PUT',
                body: JSON.stringify(editDeviceForm)
            });
            setEditingDevice(null);
            // Refresh devices for current app
            if (expandedApp) {
                const devices = await fetchWithAuth(`/api/devices?application_id=${expandedApp}`);
                setAppDevices(devices);
            }
        } catch (err: any) {
            alert(`Failed to update device: ${err.message}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDeleteDevice = async (deviceId: string) => {
        if (!confirm("Are you sure you want to delete this device?")) return;
        setIsLoadingDrillDown(true);
        try {
            await fetchWithAuth(`/api/devices/${deviceId}`, { method: 'DELETE' });
            if (expandedApp) {
                const devices = await fetchWithAuth(`/api/devices?application_id=${expandedApp}`);
                setAppDevices(devices);
            }
        } catch (err: any) {
            alert(`Delete failed: ${err.message}`);
        } finally {
            setIsLoadingDrillDown(false);
        }
    };

    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    const toggleUserExpand = async (userId: string, customerId: string) => {
        if (expandedUser === userId) {
            setExpandedUser(null);
            setUserApps([]);
            setExpandedApp(null);
            setAppDevices([]);
            return;
        }

        setExpandedUser(userId);
        setIsLoadingDrillDown(true);
        try {
            const apps = await fetchWithAuth(`/api/applications?customer_id=${customerId}`);
            setUserApps(apps);
        } catch (err) {
            console.error('Failed to fetch apps:', err);
        } finally {
            setIsLoadingDrillDown(false);
        }
    };

    const toggleAppExpand = async (appId: string) => {
        if (expandedApp === appId) {
            setExpandedApp(null);
            setAppDevices([]);
            return;
        }

        setExpandedApp(appId);
        setIsLoadingDrillDown(true);
        try {
            const devices = await fetchWithAuth(`/api/devices?application_id=${appId}`);
            setAppDevices(devices);
        } catch (err) {
            console.error('Failed to fetch devices:', err);
        } finally {
            setIsLoadingDrillDown(false);
        }
    };

    return (
        <div className="min-h-screen bg-slate-50 flex font-sans">
            <aside className="w-64 bg-slate-900 text-white flex flex-col sticky top-0 h-screen shrink-0">
                <div className="p-6 border-b border-slate-800">
                    <img src={conqueLogo} alt="Logo" className="h-8 object-contain mb-8 filter brightness-0 invert" />
                    <p className="text-xs uppercase tracking-widest text-slate-500 font-bold mb-4">Admin Panel</p>
                </div>

                <nav className="flex-1 p-4 space-y-2">
                    <button
                        onClick={() => setActiveTab('onboarding')}
                        className={cn(
                            "w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition-all",
                            activeTab === 'onboarding'
                                ? "bg-blue-600 text-white shadow-lg shadow-blue-900/40"
                                : "text-slate-400 hover:bg-slate-800 hover:text-white"
                        )}
                    >
                        <UserPlus size={20} />
                        <span className="font-medium">Add User</span>
                    </button>

                    <button
                        onClick={() => setActiveTab('users')}
                        className={cn(
                            "w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition-all",
                            activeTab === 'users'
                                ? "bg-blue-600 text-white shadow-lg shadow-blue-900/40"
                                : "text-slate-400 hover:bg-slate-800 hover:text-white"
                        )}
                    >
                        <Users size={20} />
                        <span className="font-medium">User List</span>
                    </button>
                </nav>

                <div className="p-4 border-t border-slate-800">
                    <button
                        onClick={handleLogout}
                        className="w-full flex items-center space-x-3 px-4 py-3 rounded-xl text-slate-400 hover:bg-red-950/30 hover:text-red-400 transition-all"
                    >
                        <LogOut size={20} />
                        <span className="font-medium">Sign Out</span>
                    </button>
                </div>
            </aside>

            <main className="flex-1 overflow-y-auto">
                <header className="bg-white border-b border-slate-200 px-8 py-6 sticky top-0 z-10 hidden md:flex items-center justify-between">
                    <div className="flex items-center space-x-2 text-slate-400 text-sm">
                        <LayoutDashboard size={16} />
                        <span>Admin</span>
                        <>
                            <ChevronRight size={14} />
                            <span className="text-slate-600 font-medium capitalize">{activeTab}</span>
                        </>
                    </div>

                    <div className="flex items-center space-x-4">
                        <div className="bg-slate-100 rounded-full w-10 h-10 flex items-center justify-center text-slate-600 font-bold">
                            AD
                        </div>
                    </div>
                </header>

                <div className="p-8">
                    <div className="max-w-6xl mx-auto animate-in fade-in slide-in-from-bottom-4">
                        {activeTab === 'onboarding' ? (
                            <div className="max-w-3xl mx-auto">
                                <h1 className="text-2xl font-bold text-slate-900 mb-2">Add New User</h1>
                                <p className="text-slate-500 mb-8">Register a new user, create their organization, and optionally pre-configure applications and devices.</p>

                                <div className="bg-white rounded-3xl border border-slate-100 shadow-xl p-8 space-y-8">
                                    <div className="space-y-4">
                                        <div className="flex items-center justify-between">
                                            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                                                <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-[10px]">1</div>
                                                Basic Account Details
                                            </h2>
                                            <div className="flex bg-slate-100 p-1 rounded-lg">
                                                <button
                                                    onClick={() => setUserForm(prev => ({ ...prev, role: 'ADMIN' }))}
                                                    className={cn(
                                                        "px-3 py-1 text-[10px] font-bold rounded-md transition-all",
                                                        userForm.role === 'ADMIN' ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
                                                    )}
                                                >
                                                    ADMIN
                                                </button>
                                                <button
                                                    onClick={() => setUserForm(prev => ({ ...prev, role: 'USER' }))}
                                                    className={cn(
                                                        "px-3 py-1 text-[10px] font-bold rounded-md transition-all",
                                                        userForm.role === 'USER' ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
                                                    )}
                                                >
                                                    USER
                                                </button>
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                            <div className="space-y-2">
                                                <label className="text-sm font-semibold text-slate-700">Organization Name *</label>
                                                <input
                                                    type="text"
                                                    placeholder="e.g. Acme Corp"
                                                    value={userForm.organization}
                                                    onChange={e => setUserForm(prev => ({ ...prev, organization: e.target.value }))}
                                                    className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 text-sm bg-slate-50/50"
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <label className="text-sm font-semibold text-slate-700">Username *</label>
                                                <input
                                                    type="text"
                                                    placeholder="admin_acme"
                                                    value={userForm.email}
                                                    onChange={e => setUserForm(prev => ({ ...prev, email: e.target.value }))}
                                                    className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 text-sm bg-slate-50/50"
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <label className="text-sm font-semibold text-slate-700">Password *</label>
                                                <input
                                                    type="password"
                                                    placeholder="••••••••"
                                                    value={userForm.password}
                                                    onChange={e => setUserForm(prev => ({ ...prev, password: e.target.value }))}
                                                    className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 text-sm bg-slate-50/50"
                                                />
                                            </div>
                                            <div className="grid grid-cols-2 gap-4">
                                                <div className="space-y-2">
                                                    <label className="text-sm font-semibold text-slate-700">App Limit</label>
                                                    <input
                                                        type="number"
                                                        value={userForm.appLimit}
                                                        onChange={e => setUserForm(prev => ({ ...prev, appLimit: parseInt(e.target.value) }))}
                                                        className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 text-sm"
                                                        min="1"
                                                    />
                                                </div>
                                                <div className="space-y-2">
                                                    <label className="text-sm font-semibold text-slate-700">Device Limit</label>
                                                    <input
                                                        type="number"
                                                        value={userForm.deviceLimit}
                                                        onChange={e => setUserForm(prev => ({ ...prev, deviceLimit: parseInt(e.target.value) }))}
                                                        className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 text-sm"
                                                        min="1"
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="space-y-6 pt-6 border-t border-slate-100">
                                        <div className="flex items-center justify-between">
                                            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                                                <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-[10px]">2</div>
                                                Enter Application Details
                                            </h2>
                                            <button
                                                onClick={() => setIsProvisioningExpanded(!isProvisioningExpanded)}
                                                className="text-xs font-bold text-blue-600 hover:bg-blue-50 px-3 py-1.5 rounded-lg transition-colors border border-blue-100"
                                            >
                                                {isProvisioningExpanded ? "Minimize Form" : "Expand Form (Optional)"}
                                            </button>
                                        </div>

                                        {!isProvisioningExpanded && (
                                            <div className="p-4 bg-slate-50 rounded-2xl border border-dashed border-slate-200 text-center">
                                                <p className="text-xs text-slate-400 italic">Optional: Bulk provision applications and devices for this account.</p>
                                            </div>
                                        )}

                                        {isProvisioningExpanded && (
                                            <div className="space-y-8 animate-in slide-in-from-top-4 duration-300">

                                                {userForm.apps.map((app, appIdx) => (
                                                    <div key={appIdx} className="p-8 bg-slate-50 rounded-3xl space-y-6 border border-slate-100 relative group/app animate-in fade-in slide-in-from-right-4">
                                                        {appIdx > 0 && (
                                                            <button
                                                                onClick={() => {
                                                                    const newApps = [...userForm.apps];
                                                                    newApps.splice(appIdx, 1);
                                                                    setUserForm(prev => ({ ...prev, apps: newApps }));
                                                                }}
                                                                className="absolute -top-3 -right-3 w-8 h-8 bg-red-100 text-red-600 rounded-full flex items-center justify-center hover:bg-red-200 transition-colors shadow-md opacity-0 group-hover/app:opacity-100 z-10"
                                                            >
                                                                ×
                                                            </button>
                                                        )}

                                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                                            <div className="space-y-2">
                                                                <label className="text-sm font-bold text-slate-700">Application Name</label>
                                                                <input
                                                                    type="text"
                                                                    placeholder="e.g. Smart Farm V1"
                                                                    value={app.name}
                                                                    onChange={e => {
                                                                        const newApps = [...userForm.apps];
                                                                        newApps[appIdx].name = e.target.value;
                                                                        setUserForm(prev => ({ ...prev, apps: newApps }));
                                                                    }}
                                                                    className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 text-sm bg-white"
                                                                />
                                                            </div>
                                                            <div className="space-y-2">
                                                                <label className="text-sm font-bold text-slate-700">Application ID (Optional)</label>
                                                                <input
                                                                    type="text"
                                                                    placeholder="Manual ID"
                                                                    value={app.manual_id}
                                                                    onChange={e => {
                                                                        const newApps = [...userForm.apps];
                                                                        newApps[appIdx].manual_id = e.target.value;
                                                                        setUserForm(prev => ({ ...prev, apps: newApps }));
                                                                    }}
                                                                    className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 text-sm bg-white"
                                                                />
                                                            </div>
                                                        </div>

                                                        <div className="space-y-4 pt-4 border-t border-slate-200/50">
                                                            <div className="flex items-center justify-between">
                                                                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest">Devices for {app.name || `App ${appIdx + 1}`}</h3>
                                                            </div>

                                                            <div className="grid grid-cols-1 gap-4">
                                                                {app.devices.map((device, devIdx) => (
                                                                    <div key={devIdx} className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-white p-4 rounded-2xl border border-slate-100 relative group/dev">
                                                                        {devIdx > 0 && (
                                                                            <button
                                                                                onClick={() => {
                                                                                    const newApps = [...userForm.apps];
                                                                                    newApps[appIdx].devices.splice(devIdx, 1);
                                                                                    setUserForm(prev => ({ ...prev, apps: newApps }));
                                                                                }}
                                                                                className="absolute -top-2 -right-2 w-5 h-5 bg-red-50 text-red-500 rounded-full flex items-center justify-center hover:bg-red-100 opacity-0 group-hover/dev:opacity-100 transition-opacity"
                                                                            >
                                                                                ×
                                                                            </button>
                                                                        )}
                                                                        <div className="space-y-1">
                                                                            <label className="text-[10px] font-bold text-slate-400 uppercase">Name</label>
                                                                            <input
                                                                                type="text"
                                                                                value={device.name}
                                                                                onChange={e => {
                                                                                    const newApps = [...userForm.apps];
                                                                                    newApps[appIdx].devices[devIdx].name = e.target.value;
                                                                                    setUserForm(prev => ({ ...prev, apps: newApps }));
                                                                                }}
                                                                                className="w-full px-3 py-2 rounded-lg border border-slate-100 text-xs focus:ring-1 focus:ring-blue-500"
                                                                            />
                                                                        </div>
                                                                        <div className="space-y-1">
                                                                            <label className="text-[10px] font-bold text-slate-400 uppercase">Serial / ID</label>
                                                                            <input
                                                                                type="text"
                                                                                value={device.device_id}
                                                                                onChange={e => {
                                                                                    const newApps = [...userForm.apps];
                                                                                    newApps[appIdx].devices[devIdx].device_id = e.target.value;
                                                                                    setUserForm(prev => ({ ...prev, apps: newApps }));
                                                                                }}
                                                                                className="w-full px-3 py-2 rounded-lg border border-slate-100 text-xs focus:ring-1 focus:ring-blue-500"
                                                                            />
                                                                        </div>
                                                                        <div className="space-y-1">
                                                                            <label className="text-[10px] font-bold text-slate-400 uppercase">Version</label>
                                                                            <input
                                                                                type="text"
                                                                                value={device.version}
                                                                                onChange={e => {
                                                                                    const newApps = [...userForm.apps];
                                                                                    newApps[appIdx].devices[devIdx].version = e.target.value;
                                                                                    setUserForm(prev => ({ ...prev, apps: newApps }));
                                                                                }}
                                                                                className="w-full px-3 py-2 rounded-lg border border-slate-100 text-xs focus:ring-1 focus:ring-blue-500"
                                                                            />
                                                                        </div>
                                                                    </div>
                                                                ))}
                                                                <button
                                                                    type="button"
                                                                    onClick={() => {
                                                                        const newApps = [...userForm.apps];
                                                                        newApps[appIdx].devices.push({ name: '', device_id: '', version: '' });
                                                                        setUserForm(prev => ({ ...prev, apps: newApps }));
                                                                    }}
                                                                    className="py-2 rounded-xl border border-dashed border-slate-200 text-slate-400 text-[10px] font-bold hover:bg-white hover:text-blue-500 transition-all"
                                                                >
                                                                    + Add Device to {app.name || 'App'}
                                                                </button>
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}

                                                <button
                                                    type="button"
                                                    onClick={() => setUserForm(prev => ({
                                                        ...prev,
                                                        apps: [...prev.apps, { name: '', manual_id: '', devices: [{ name: '', device_id: '', version: '' }] }]
                                                    }))}
                                                    className="w-full py-4 rounded-2xl border-2 border-dashed border-blue-100 text-blue-400 font-bold text-sm hover:border-blue-400 hover:bg-blue-50/50 transition-all flex items-center justify-center gap-2 group"
                                                >
                                                    <div className="w-6 h-6 rounded-full bg-blue-50 group-hover:bg-blue-100 flex items-center justify-center transition-colors">+</div>
                                                    Add Another Application
                                                </button>
                                            </div>
                                        )}
                                    </div>

                                    <button
                                        onClick={handleCreateAccount}
                                        disabled={isSubmitting}
                                        className={cn(
                                            "w-full bg-blue-600 text-white font-bold py-4 rounded-2xl shadow-lg shadow-blue-500/30 hover:bg-blue-700 hover:scale-[1.01] transition-all flex items-center justify-center gap-2",
                                            isSubmitting && "opacity-70 cursor-not-allowed"
                                        )}
                                    >
                                        {isSubmitting ? <span className="animate-pulse">Creating...</span> : "Create User and Configure"}
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-6">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <h1 className="text-2xl font-bold text-slate-900">User Management</h1>
                                        <p className="text-slate-500">View and manage all registered administrators and users.</p>
                                    </div>
                                    <button
                                        onClick={fetchUsers}
                                        disabled={isLoadingUsers}
                                        className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50 transition-all shadow-sm"
                                    >
                                        <RefreshCw size={16} className={cn(isLoadingUsers && "animate-spin")} />
                                        Refresh
                                    </button>
                                </div>

                                <div className="bg-white rounded-3xl border border-slate-100 shadow-xl overflow-hidden">
                                    <table className="w-full text-left">
                                        <thead>
                                            <tr className="bg-slate-50 border-b border-slate-100">
                                                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Username</th>
                                                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Role</th>
                                                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Organization</th>
                                                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-50">
                                            {isLoadingUsers ? (
                                                <tr>
                                                    <td colSpan={4} className="px-6 py-12 text-center text-slate-400">
                                                        <div className="flex flex-col items-center gap-2">
                                                            <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                                                            Loading users...
                                                        </div>
                                                    </td>
                                                </tr>
                                            ) : users.length === 0 ? (
                                                <tr>
                                                    <td colSpan={4} className="px-6 py-12 text-center text-slate-400">
                                                        No users found. Create your first organization to get started.
                                                    </td>
                                                </tr>
                                            ) : (
                                                users.map((user) => (
                                                    <React.Fragment key={user._id}>
                                                        <tr
                                                            className={cn(
                                                                "border-b border-slate-50 transition-colors group cursor-pointer",
                                                                expandedUser === user._id ? "bg-blue-50/50" : "hover:bg-slate-50/50"
                                                            )}
                                                            onClick={() => toggleUserExpand(user._id, user.customer_id)}
                                                        >
                                                            <td className="px-6 py-5">
                                                                <div className="flex items-center gap-3">
                                                                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white shadow-sm font-bold">
                                                                        {user.email?.[0]?.toUpperCase() || 'U'}
                                                                    </div>
                                                                    <div className="flex flex-col">
                                                                        <span className="font-bold text-slate-900">{user.email}</span>
                                                                        <span className="text-[10px] text-slate-400 font-medium">ID: {user._id.slice(-6)}</span>
                                                                    </div>
                                                                </div>
                                                            </td>
                                                            <td className="px-6 py-5">
                                                                <span className={cn(
                                                                    "px-3 py-1 rounded-full text-[10px] font-bold tracking-wider uppercase",
                                                                    user.role === 'ADMIN' ? "bg-indigo-100 text-indigo-700" : "bg-emerald-100 text-emerald-700"
                                                                )}>
                                                                    {user.role}
                                                                </span>
                                                            </td>
                                                            <td className="px-6 py-5">
                                                                <span className="text-sm font-semibold text-slate-600 truncate block max-w-[150px]">
                                                                    {user.customer_name || 'Individual'}
                                                                </span>
                                                            </td>
                                                            <td className="px-6 py-5 text-right space-x-2" onClick={e => e.stopPropagation()}>
                                                                <button
                                                                    onClick={() => handleStartEdit(user)}
                                                                    className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                                                                    title="Edit Profile"
                                                                >
                                                                    <Edit2 size={18} />
                                                                </button>
                                                                <button
                                                                    onClick={() => handleDeleteUser(user._id)}
                                                                    className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                                                                    title="Delete User"
                                                                >
                                                                    <Trash2 size={18} />
                                                                </button>
                                                            </td>
                                                        </tr>

                                                        {expandedUser === user._id && (
                                                            <tr className="bg-slate-50/30">
                                                                <td colSpan={4} className="px-8 py-0">
                                                                    <div className="border-l-2 border-blue-200 ml-5 pl-8 py-4 space-y-4 animate-in slide-in-from-top-2 duration-200">
                                                                        <div className="flex items-center justify-between">
                                                                            <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Applications</h4>
                                                                            <button
                                                                                onClick={() => handleAddApp(user.customer_id)}
                                                                                className="text-[10px] font-bold text-blue-600 hover:text-blue-700 bg-blue-50 px-2 py-1 rounded-lg transition-colors"
                                                                            >
                                                                                + New App
                                                                            </button>
                                                                        </div>

                                                                        {isLoadingDrillDown && userApps.length === 0 ? (
                                                                            <div className="flex items-center gap-2 text-xs text-slate-400 py-2">
                                                                                <RefreshCw size={12} className="animate-spin" /> Loading apps...
                                                                            </div>
                                                                        ) : userApps.length === 0 ? (
                                                                            <div className="text-xs text-slate-400 py-2 italic">No applications found.</div>
                                                                        ) : (
                                                                            <div className="grid grid-cols-1 gap-3">
                                                                                {userApps.map(app => (
                                                                                    <div key={app._id} className="space-y-3">
                                                                                        <div
                                                                                            className={cn(
                                                                                                "p-4 rounded-2xl border transition-all cursor-pointer flex items-center justify-between group",
                                                                                                expandedApp === app._id
                                                                                                    ? "bg-white border-blue-200 shadow-sm"
                                                                                                    : "bg-white border-slate-100 hover:border-blue-100"
                                                                                            )}
                                                                                            onClick={() => toggleAppExpand(app._id)}
                                                                                        >
                                                                                            <div className="flex items-center gap-3">
                                                                                                <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-500 flex items-center justify-center">
                                                                                                    <LayoutDashboard size={14} />
                                                                                                </div>
                                                                                                <div className="flex flex-col">
                                                                                                    <span className="text-sm font-bold text-slate-700">{app.name}</span>
                                                                                                    <span className="text-[10px] text-slate-400">ID: {app.manual_id || app._id}</span>
                                                                                                </div>
                                                                                            </div>
                                                                                            <div className="flex items-center gap-2">
                                                                                                <button onClick={(e) => { e.stopPropagation(); handleStartEditApp(app); }} className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all opacity-0 group-hover:opacity-100" title="Edit App"><Edit2 size={16} /></button>
                                                                                                <button onClick={(e) => { e.stopPropagation(); handleDeleteApp(app._id); }} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all opacity-0 group-hover:opacity-100" title="Delete App"><Trash2 size={16} /></button>
                                                                                                <ChevronRight
                                                                                                    size={16}
                                                                                                    className={cn(
                                                                                                        "text-slate-300 transition-transform",
                                                                                                        expandedApp === app._id && "rotate-90 text-blue-500"
                                                                                                    )}
                                                                                                />
                                                                                            </div>
                                                                                        </div>

                                                                                        {expandedApp === app._id && (
                                                                                            <div className="border-l-2 border-slate-200 ml-4 pl-6 py-2 space-y-2 animate-in slide-in-from-top-1 duration-200">
                                                                                                <div className="flex items-center justify-between mb-2">
                                                                                                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Devices</span>
                                                                                                    <button
                                                                                                        onClick={() => handleAddDevice(app._id, user.customer_id)}
                                                                                                        className="text-[9px] font-bold text-blue-500 hover:text-blue-600"
                                                                                                    >
                                                                                                        + Add Device
                                                                                                    </button>
                                                                                                </div>
                                                                                                {isLoadingDrillDown ? (
                                                                                                    <div className="flex items-center gap-2 text-[10px] text-slate-400">
                                                                                                        <RefreshCw size={10} className="animate-spin" /> Loading devices...
                                                                                                    </div>
                                                                                                ) : appDevices.length === 0 ? (
                                                                                                    <div className="text-[10px] text-slate-400 italic">No devices found.</div>
                                                                                                ) : (
                                                                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                                                                                        {appDevices.map(device => (
                                                                                                            <div key={device._id} className="p-3 bg-white rounded-xl border border-slate-100 flex items-center justify-between group/dev">
                                                                                                                <div className="flex flex-col">
                                                                                                                    <span className="text-xs font-bold text-slate-600">{device.name}</span>
                                                                                                                    <span className="text-[9px] text-slate-400 font-medium">{device.device_id_string}</span>
                                                                                                                </div>
                                                                                                                <div className="flex items-center gap-2">
                                                                                                                    <span className="text-[9px] font-bold text-blue-500 bg-blue-50 px-2 py-0.5 rounded-full">{device.version || 'v1.0'}</span>
                                                                                                                    <button onClick={() => handleStartEditDevice(device)} className="p-1 text-slate-300 hover:text-blue-600 hover:bg-blue-50 rounded transition-all opacity-0 group-hover/dev:opacity-100" title="Edit Device"><Edit2 size={14} /></button>
                                                                                                                    <button onClick={() => handleDeleteDevice(device._id)} className="p-1 text-slate-300 hover:text-red-600 hover:bg-red-50 rounded transition-all opacity-0 group-hover/dev:opacity-100" title="Delete Device"><Trash2 size={14} /></button>
                                                                                                                </div>
                                                                                                            </div>
                                                                                                        ))}
                                                                                                    </div>
                                                                                                )}
                                                                                            </div>
                                                                                        )}
                                                                                    </div>
                                                                                ))}
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                </td>
                                                            </tr>
                                                        )}
                                                    </React.Fragment>
                                                ))
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </main>

            {editingUser && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto animate-in zoom-in-95 duration-200">
                        <div className="p-8 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white z-10">
                            <div>
                                <h3 className="text-xl font-bold text-slate-900">Edit User Details</h3>
                                <p className="text-sm text-slate-500">{editingUser.username} ({editingUser.customer_name})</p>
                            </div>
                            <button
                                onClick={() => setEditingUser(null)}
                                className="p-2 hover:bg-slate-100 rounded-full transition-colors"
                            >
                                <LogOut size={20} className="rotate-180" />
                            </button>
                        </div>

                        <div className="p-8 space-y-8">
                            <div className="space-y-4">
                                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Credentials</h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <label className="text-sm font-semibold text-slate-700">Username / Email</label>
                                        <input
                                            type="text"
                                            value={editForm.email}
                                            onChange={e => setEditForm(prev => ({ ...prev, email: e.target.value }))}
                                            className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 text-sm"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-sm font-semibold text-slate-700">New Password (leave blank to keep current)</label>
                                        <input
                                            type="password"
                                            placeholder="••••••••"
                                            value={editForm.password}
                                            onChange={e => setEditForm(prev => ({ ...prev, password: e.target.value }))}
                                            className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 text-sm"
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-4">
                                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Organization Limits</h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <label className="text-sm font-semibold text-slate-700">App Limit</label>
                                        <input
                                            type="number"
                                            value={editForm.appLimit}
                                            onChange={e => setEditForm(prev => ({ ...prev, appLimit: parseInt(e.target.value) }))}
                                            className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 text-sm"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-sm font-semibold text-slate-700">Device Limit</label>
                                        <input
                                            type="number"
                                            value={editForm.deviceLimit}
                                            onChange={e => setEditForm(prev => ({ ...prev, deviceLimit: parseInt(e.target.value) }))}
                                            className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 text-sm"
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="p-8 border-t border-slate-100 bg-slate-50/50 flex gap-4 sticky bottom-0 z-10">
                            <button
                                onClick={() => setEditingUser(null)}
                                className="flex-1 px-6 py-3 rounded-xl border border-slate-200 font-bold text-slate-600 hover:bg-white transition-all"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSaveEdit}
                                disabled={isSubmitting}
                                className={cn(
                                    "flex-[2] px-6 py-3 rounded-xl bg-blue-600 text-white font-bold shadow-lg shadow-blue-500/30 hover:bg-blue-700 transition-all flex items-center justify-center gap-2",
                                    isSubmitting && "opacity-70 cursor-not-allowed"
                                )}
                            >
                                {isSubmitting ? <RefreshCw size={18} className="animate-spin" /> : "Save Changes"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {addingAppToUser && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto animate-in zoom-in-95 duration-200 flex flex-col">
                        <div className="p-8 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white z-10">
                            <div>
                                <h3 className="text-xl font-bold text-slate-900">Add New Application</h3>
                                <p className="text-sm text-slate-500">Provision a new application and its devices for this user.</p>
                            </div>
                            <button
                                onClick={() => setAddingAppToUser(null)}
                                className="p-2 hover:bg-slate-100 rounded-full transition-colors"
                            >
                                <LogOut size={20} className="rotate-180" />
                            </button>
                        </div>

                        <div className="p-8 space-y-8 flex-1">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <label className="text-sm font-bold text-slate-700">Application Name</label>
                                    <input
                                        type="text"
                                        placeholder="e.g. Smart Farm V1"
                                        value={newAppForm.name}
                                        onChange={e => setNewAppForm(prev => ({ ...prev, name: e.target.value }))}
                                        className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 text-sm bg-white"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-bold text-slate-700">Application ID (Optional)</label>
                                    <input
                                        type="text"
                                        placeholder="Manual ID"
                                        value={newAppForm.manual_id}
                                        onChange={e => setNewAppForm(prev => ({ ...prev, manual_id: e.target.value }))}
                                        className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 text-sm bg-white"
                                    />
                                </div>
                            </div>

                            <div className="space-y-4 pt-4 border-t border-slate-100">
                                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest">Initial Devices</h3>
                                <div className="grid grid-cols-1 gap-4">
                                    {newAppForm.devices.map((device, devIdx) => (
                                        <div key={devIdx} className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-100 relative group/dev">
                                            {devIdx > 0 && (
                                                <button
                                                    onClick={() => {
                                                        const newDevs = [...newAppForm.devices];
                                                        newDevs.splice(devIdx, 1);
                                                        setNewAppForm(prev => ({ ...prev, devices: newDevs }));
                                                    }}
                                                    className="absolute -top-2 -right-2 w-5 h-5 bg-red-50 text-red-500 rounded-full flex items-center justify-center hover:bg-red-100 opacity-0 group-hover/dev:opacity-100 transition-opacity"
                                                >
                                                    ×
                                                </button>
                                            )}
                                            <div className="space-y-1">
                                                <label className="text-[10px] font-bold text-slate-400 uppercase">Name</label>
                                                <input
                                                    type="text"
                                                    value={device.name}
                                                    onChange={e => {
                                                        const newDevs = [...newAppForm.devices];
                                                        newDevs[devIdx].name = e.target.value;
                                                        setNewAppForm(prev => ({ ...prev, devices: newDevs }));
                                                    }}
                                                    className="w-full px-3 py-2 rounded-lg border border-slate-100 text-xs focus:ring-1 focus:ring-blue-500"
                                                />
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-[10px] font-bold text-slate-400 uppercase">Serial / ID</label>
                                                <input
                                                    type="text"
                                                    value={device.device_id}
                                                    onChange={e => {
                                                        const newDevs = [...newAppForm.devices];
                                                        newDevs[devIdx].device_id = e.target.value;
                                                        setNewAppForm(prev => ({ ...prev, devices: newDevs }));
                                                    }}
                                                    className="w-full px-3 py-2 rounded-lg border border-slate-100 text-xs focus:ring-1 focus:ring-blue-500"
                                                />
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-[10px] font-bold text-slate-400 uppercase">Version</label>
                                                <input
                                                    type="text"
                                                    value={device.version}
                                                    onChange={e => {
                                                        const newDevs = [...newAppForm.devices];
                                                        newDevs[devIdx].version = e.target.value;
                                                        setNewAppForm(prev => ({ ...prev, devices: newDevs }));
                                                    }}
                                                    className="w-full px-3 py-2 rounded-lg border border-slate-100 text-xs focus:ring-1 focus:ring-blue-500"
                                                />
                                            </div>
                                        </div>
                                    ))}
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setNewAppForm(prev => ({
                                                ...prev,
                                                devices: [...prev.devices, { name: '', device_id: '', version: '' }]
                                            }));
                                        }}
                                        className="py-2 rounded-xl border border-dashed border-slate-200 text-slate-400 text-[10px] font-bold hover:bg-slate-50 hover:text-blue-500 transition-all"
                                    >
                                        + Add Another Device
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div className="p-8 border-t border-slate-100 bg-slate-50/50 flex gap-4 sticky bottom-0 z-10">
                            <button
                                onClick={() => setAddingAppToUser(null)}
                                className="flex-1 px-6 py-3 rounded-xl border border-slate-200 font-bold text-slate-600 hover:bg-white transition-all"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSaveNewApp}
                                disabled={isSubmitting}
                                className={cn(
                                    "flex-[2] px-6 py-3 rounded-xl bg-blue-600 text-white font-bold shadow-lg shadow-blue-500/30 hover:bg-blue-700 transition-all flex items-center justify-center gap-2",
                                    isSubmitting && "opacity-70 cursor-not-allowed"
                                )}
                            >
                                {isSubmitting ? <RefreshCw size={18} className="animate-spin" /> : "Save Application Setup"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Add Device Modal */}
            {addingDeviceToApp && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md animate-in zoom-in-95 duration-200">
                        <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                            <div>
                                <h3 className="text-lg font-bold text-slate-900">Add New Device</h3>
                                <p className="text-xs text-slate-400 mt-0.5">Fill in the device details below.</p>
                            </div>
                            <button onClick={() => setAddingDeviceToApp(null)} className="p-2 hover:bg-slate-100 text-slate-400 rounded-full transition-colors">
                                <LogOut size={20} className="rotate-180" />
                            </button>
                        </div>
                        <div className="p-6 space-y-4">
                            <div className="space-y-2">
                                <label className="text-sm font-semibold text-slate-700">Device Name <span className="text-red-500">*</span></label>
                                <input
                                    type="text"
                                    placeholder="e.g. Sensor Node Alpha"
                                    value={newDeviceForm.name}
                                    onChange={e => setNewDeviceForm(prev => ({ ...prev, name: e.target.value }))}
                                    className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none text-sm transition-all"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-semibold text-slate-700">Device ID / Serial <span className="text-red-500">*</span></label>
                                <input
                                    type="text"
                                    placeholder="e.g. SN-00123456"
                                    value={newDeviceForm.device_id}
                                    onChange={e => setNewDeviceForm(prev => ({ ...prev, device_id: e.target.value }))}
                                    className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none text-sm transition-all"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-semibold text-slate-700">Version</label>
                                <input
                                    type="text"
                                    placeholder="e.g. v1.0.0"
                                    value={newDeviceForm.version}
                                    onChange={e => setNewDeviceForm(prev => ({ ...prev, version: e.target.value }))}
                                    className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none text-sm transition-all"
                                />
                            </div>
                        </div>
                        <div className="p-6 border-t border-slate-100 bg-slate-50/50 flex gap-4 rounded-b-3xl">
                            <button onClick={() => setAddingDeviceToApp(null)} className="flex-1 px-4 py-2 rounded-xl border border-slate-200 font-bold text-slate-600 hover:bg-white transition-all">Cancel</button>
                            <button
                                onClick={handleSaveNewDevice}
                                disabled={isSubmitting}
                                className="flex-1 px-4 py-2 rounded-xl bg-indigo-600 text-white font-bold shadow-lg shadow-indigo-500/30 hover:bg-indigo-700 transition-all flex items-center justify-center gap-2 disabled:opacity-70"
                            >
                                {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : "Add Device"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Edit Application Modal */}
            {editingApp && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md animate-in zoom-in-95 duration-200">
                        <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                            <h3 className="text-lg font-bold text-slate-900">Edit Application</h3>
                            <button onClick={() => setEditingApp(null)} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                                <LogOut size={20} className="rotate-180" />
                            </button>
                        </div>
                        <div className="p-6 space-y-4">
                            <div className="space-y-2">
                                <label className="text-sm font-semibold text-slate-700">Application Name</label>
                                <input type="text" value={editAppForm.name} onChange={e => setEditAppForm(prev => ({ ...prev, name: e.target.value }))} className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 text-sm" />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-semibold text-slate-700">Manual ID</label>
                                <input type="text" value={editAppForm.manual_id} onChange={e => setEditAppForm(prev => ({ ...prev, manual_id: e.target.value }))} className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 text-sm" />
                            </div>
                        </div>
                        <div className="p-6 border-t border-slate-100 bg-slate-50/50 flex gap-4 rounded-b-3xl">
                            <button onClick={() => setEditingApp(null)} className="flex-1 px-4 py-2 rounded-xl border border-slate-200 font-bold text-slate-600 hover:bg-white transition-all">Cancel</button>
                            <button onClick={handleSaveEditApp} disabled={isSubmitting} className={cn("flex-1 px-4 py-2 rounded-xl bg-blue-600 text-white font-bold shadow-lg shadow-blue-500/30 hover:bg-blue-700 transition-all flex items-center justify-center gap-2", isSubmitting && "opacity-70 cursor-not-allowed")}>{isSubmitting ? <RefreshCw size={16} className="animate-spin" /> : "Save"}</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Edit Device Modal */}
            {editingDevice && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md animate-in zoom-in-95 duration-200">
                        <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                            <h3 className="text-lg font-bold text-slate-900">Edit Device</h3>
                            <button onClick={() => setEditingDevice(null)} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                                <LogOut size={20} className="rotate-180" />
                            </button>
                        </div>
                        <div className="p-6 space-y-4">
                            <div className="space-y-2">
                                <label className="text-sm font-semibold text-slate-700">Device Name</label>
                                <input type="text" value={editDeviceForm.name} onChange={e => setEditDeviceForm(prev => ({ ...prev, name: e.target.value }))} className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 text-sm" />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-semibold text-slate-700">Serial / ID</label>
                                <input type="text" value={editDeviceForm.device_id_string} onChange={e => setEditDeviceForm(prev => ({ ...prev, device_id_string: e.target.value }))} className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 text-sm" />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-semibold text-slate-700">Version</label>
                                <input type="text" value={editDeviceForm.version} onChange={e => setEditDeviceForm(prev => ({ ...prev, version: e.target.value }))} className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 text-sm" />
                            </div>
                        </div>
                        <div className="p-6 border-t border-slate-100 bg-slate-50/50 flex gap-4 rounded-b-3xl">
                            <button onClick={() => setEditingDevice(null)} className="flex-1 px-4 py-2 rounded-xl border border-slate-200 font-bold text-slate-600 hover:bg-white transition-all">Cancel</button>
                            <button onClick={handleSaveEditDevice} disabled={isSubmitting} className={cn("flex-1 px-4 py-2 rounded-xl bg-blue-600 text-white font-bold shadow-lg shadow-blue-500/30 hover:bg-blue-700 transition-all flex items-center justify-center gap-2", isSubmitting && "opacity-70 cursor-not-allowed")}>{isSubmitting ? <RefreshCw size={16} className="animate-spin" /> : "Save"}</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AdminDashboard;
