import React, { useState, useEffect } from 'react';
import {
    Users,
    Search,
    ChevronDown,
    ChevronRight,
    Layout,
    Loader2,
    RefreshCw,
    AlertCircle,
    Settings,
    Plus,
    X
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface Customer {
    _id: string;
    name: string;
    device_limit: number;
    app_limit: number;
    app_count?: number;
}

interface Application {
    _id: string;
    name: string;
    description?: string;
    device_limit?: number;
    device_count?: number;
    customer_id: string;
}

interface Device {
    _id: string;
    name: string;
    status: 'online' | 'offline' | 'unknown' | 'PROVISIONED';
    last_seen?: string;
    application_id?: string;
    device_id_string?: string;
}

const SuperAdminAnalytics: React.FC = () => {
    const [customers, setCustomers] = useState<Customer[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [expandedCustomers, setExpandedCustomers] = useState<Set<string>>(new Set());
    const [applications, setApplications] = useState<Record<string, Application[]>>({});
    const [devices, setDevices] = useState<Record<string, Device[]>>({});
    const [loadingDetails, setLoadingDetails] = useState<Record<string, boolean>>({});
    const [expandedDevices, setExpandedDevices] = useState<Set<string>>(new Set());

    // Modal states
    const [showCreateCustomer, setShowCreateCustomer] = useState(false);
    const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
    const [showCreateApp, setShowCreateApp] = useState<string | null>(null); // customer_id
    const [showCreateUser, setShowCreateUser] = useState<string | null>(null); // customer_id

    // Form inputs
    const [customerForm, setCustomerForm] = useState({ name: '', device_limit: 10, app_limit: 5 });
    const [appForm, setAppForm] = useState({ name: '', description: '' });
    const [userForm, setUserForm] = useState({ email: '', password: '', role: 'ADMIN' });

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

    const loadCustomers = async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await fetchWithAuth('/api/customers');
            setCustomers(data);
        } catch (err: any) {
            setError(err.message || 'Failed to fetch customers');
        } finally {
            setLoading(false);
        }
    };

    const handleSaveCustomer = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const endpoint = editingCustomer ? `/api/customers/${editingCustomer._id}` : '/api/customers';
            const method = editingCustomer ? 'PUT' : 'POST';
            await fetchWithAuth(endpoint, {
                method,
                body: JSON.stringify(customerForm)
            });
            setShowCreateCustomer(false);
            setEditingCustomer(null);
            setCustomerForm({ name: '', device_limit: 10, app_limit: 5 });
            loadCustomers();
        } catch (err: any) {
            alert(err.message);
        }
    };

    const handleCreateApp = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await fetchWithAuth('/api/applications', {
                method: 'POST',
                body: JSON.stringify({ ...appForm, customer_id: showCreateApp })
            });
            const cid = showCreateApp!;
            setShowCreateApp(null);
            setAppForm({ name: '', description: '' });
            // Refresh apps for this customer
            const apps = await fetchWithAuth(`/api/applications?customer_id=${cid}`);
            setApplications(prev => ({ ...prev, [cid]: apps }));
        } catch (err: any) {
            alert(err.message);
        }
    };

    const handleCreateUser = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const customer = customers.find(c => c._id === showCreateUser);
            await fetchWithAuth('/api/auth/register', {
                method: 'POST',
                body: JSON.stringify({
                    ...userForm,
                    customer_id: showCreateUser,
                    customer_name: customer?.name
                })
            });
            setShowCreateUser(null);
            setUserForm({ email: '', password: '', role: 'ADMIN' });
        } catch (err: any) {
            alert(err.message);
        }
    };

    useEffect(() => {
        loadCustomers();
    }, []);

    const toggleCustomer = async (customerId: string) => {
        const newExpanded = new Set(expandedCustomers);
        if (newExpanded.has(customerId)) {
            newExpanded.delete(customerId);
        } else {
            newExpanded.add(customerId);
            if (!applications[customerId]) {
                setLoadingDetails(prev => ({ ...prev, [customerId]: true }));
                try {
                    const apps = await fetchWithAuth(`/api/applications?customer_id=${customerId}`);
                    setApplications(prev => ({ ...prev, [customerId]: apps }));
                } catch (err) {
                    console.error(`Failed to fetch apps for customer ${customerId}`, err);
                } finally {
                    setLoadingDetails(prev => ({ ...prev, [customerId]: false }));
                }
            }
        }
        setExpandedCustomers(newExpanded);
    };

    const loadDevices = async (appId: string) => {
        if (devices[appId]) return;
        setLoadingDetails(prev => ({ ...prev, [appId]: true }));
        try {
            const data = await fetchWithAuth(`/api/devices?application_id=${appId}`);
            setDevices(prev => ({ ...prev, [appId]: data }));
        } catch (err) {
            console.error(`Failed to fetch devices for app ${appId}`, err);
        } finally {
            setLoadingDetails(prev => ({ ...prev, [appId]: false }));
        }
    };

    const toggleDevice = (deviceId: string) => {
        const newExpanded = new Set(expandedDevices);
        if (newExpanded.has(deviceId)) {
            newExpanded.delete(deviceId);
        } else {
            newExpanded.add(deviceId);
        }
        setExpandedDevices(newExpanded);
    };

    const filteredCustomers = customers.filter(c =>
        c.name.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <div className="max-w-7xl mx-auto animate-in fade-in slide-in-from-bottom-4">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                        <Users className="text-blue-600" />
                        System Management
                    </h1>
                    <p className="text-slate-500">Manage customers, applications, and their usage limits.</p>
                </div>

                <div className="flex items-center gap-3">
                    <button
                        onClick={() => {
                            setEditingCustomer(null);
                            setCustomerForm({ name: '', device_limit: 10, app_limit: 5 });
                            setShowCreateCustomer(true);
                        }}
                        className="px-4 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-bold shadow-sm hover:bg-blue-700 transition-all flex items-center gap-2"
                    >
                        <Plus size={18} />
                        Add Customer
                    </button>
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                        <input
                            type="text"
                            placeholder="Search customers..."
                            className="pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 w-full md:w-64 text-sm shadow-sm transition-all text-slate-900"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>
                    <button
                        onClick={loadCustomers}
                        className="p-2.5 bg-white border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50 hover:text-blue-600 transition-all shadow-sm"
                        title="Refresh Data"
                    >
                        <RefreshCw size={18} className={cn(loading && "animate-spin")} />
                    </button>
                </div>
            </div>

            {/* ERROR UI */}
            {error && (
                <div className="bg-red-50 border border-red-100 p-4 rounded-2xl flex items-center gap-3 text-red-600 mb-6">
                    <AlertCircle size={20} />
                    <p className="font-medium text-sm">{error}</p>
                    <button onClick={loadCustomers} className="ml-auto text-xs font-bold uppercase tracking-wider underline">Retry</button>
                </div>
            )}

            {/* Main Table */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden overflow-x-auto">
                <table className="w-full text-left border-collapse">
                    <thead className="bg-slate-50 border-b border-slate-200">
                        <tr>
                            <th className="w-10 px-6 py-4 text-center"></th>
                            <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500">Customer Name</th>
                            <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500 text-center">App Limit</th>
                            <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500 text-center">Device Limit</th>
                            <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500 text-center">Apps</th>
                            <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {loading && customers.length === 0 ? (
                            <tr>
                                <td colSpan={6} className="px-6 py-20 text-center">
                                    <div className="flex flex-col items-center gap-3">
                                        <Loader2 className="h-10 w-10 text-blue-600 animate-spin" />
                                        <p className="text-slate-500 font-medium">Loading customers...</p>
                                    </div>
                                </td>
                            </tr>
                        ) : filteredCustomers.length === 0 ? (
                            <tr>
                                <td colSpan={6} className="px-6 py-20 text-center">
                                    <p className="text-slate-400 font-medium">No customers found matching your search.</p>
                                </td>
                            </tr>
                        ) : filteredCustomers.map(customer => {
                            const isExpanded = expandedCustomers.has(customer._id);
                            return (
                                <React.Fragment key={customer._id}>
                                    <tr
                                        className={cn(
                                            "hover:bg-slate-50 transition-all cursor-pointer group",
                                            isExpanded && "bg-blue-50/30"
                                        )}
                                        onClick={() => toggleCustomer(customer._id)}
                                    >
                                        <td className="px-6 py-4 text-center">
                                            {isExpanded ? (
                                                <ChevronDown size={18} className="text-blue-600 mx-auto" />
                                            ) : (
                                                <ChevronRight size={18} className="text-slate-400 group-hover:text-slate-600 mx-auto" />
                                            )}
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 text-white flex items-center justify-center font-bold text-sm shadow-sm transition-transform group-hover:scale-105">
                                                    {customer.name.charAt(0).toUpperCase()}
                                                </div>
                                                <div className="font-semibold text-slate-900">{customer.name}</div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-center font-medium text-slate-600">
                                            {customer.app_limit}
                                        </td>
                                        <td className="px-6 py-4 text-center font-medium text-slate-600">
                                            {customer.device_limit}
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            <div className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-white border border-slate-200 text-slate-900 font-bold text-xs shadow-sm">
                                                {applications[customer._id]?.length ?? '0'}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <div className="flex items-center justify-end gap-2">
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setShowCreateUser(customer._id);
                                                    }}
                                                    className="px-2 py-1 text-[10px] font-bold text-blue-600 uppercase tracking-widest hover:bg-blue-50 rounded-lg transition-colors border border-blue-100"
                                                >
                                                    + User
                                                </button>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setEditingCustomer(customer);
                                                        setCustomerForm({ name: customer.name, device_limit: customer.device_limit, app_limit: customer.app_limit });
                                                        setShowCreateCustomer(true);
                                                    }}
                                                    className="text-slate-400 hover:text-blue-600 transition-colors p-2"
                                                >
                                                    <Settings size={18} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>

                                    {/* Detailed Expanded View */}
                                    {isExpanded && (
                                        <tr className="bg-slate-50/50">
                                            <td colSpan={6} className="px-6 py-0 animate-in fade-in slide-in-from-top-2 duration-200 border-none">
                                                <div className="py-6 pl-14 pr-6">
                                                    <div className="flex items-center justify-between mb-4">
                                                        <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                                                            <Layout size={16} className="text-blue-600" />
                                                            Applications ({applications[customer._id]?.length || 0})
                                                        </h3>
                                                        <button
                                                            onClick={() => setShowCreateApp(customer._id)}
                                                            className="px-3 py-1 bg-white border border-blue-200 text-[10px] font-bold text-blue-600 uppercase tracking-widest hover:bg-blue-600 hover:text-white rounded-lg transition-all shadow-sm flex items-center gap-1.5"
                                                        >
                                                            <Plus size={12} />
                                                            New App
                                                        </button>
                                                    </div>

                                                    {loadingDetails[customer._id] ? (
                                                        <div className="flex items-center gap-3 text-slate-500 py-4">
                                                            <Loader2 size={16} className="animate-spin" />
                                                            <span className="text-xs font-medium">Fetching applications...</span>
                                                        </div>
                                                    ) : !applications[customer._id] || applications[customer._id].length === 0 ? (
                                                        <div className="text-xs text-slate-400 italic py-8 text-center bg-white/50 border border-slate-100 rounded-2xl border-dashed">
                                                            No applications found for this customer.
                                                        </div>
                                                    ) : (
                                                        <div className="grid grid-cols-1 gap-4">
                                                            {applications[customer._id].map(app => (
                                                                <div key={app._id} className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm hover:border-blue-200 transition-colors">
                                                                    <div
                                                                        className="px-5 py-4 flex items-center justify-between cursor-pointer hover:bg-slate-50/50 transition-colors"
                                                                        onClick={() => loadDevices(app._id)}
                                                                    >
                                                                        <div className="flex items-center gap-4">
                                                                            <div className="w-10 h-10 bg-slate-50 rounded-xl flex items-center justify-center text-slate-400">
                                                                                <Layout size={20} />
                                                                            </div>
                                                                            <div>
                                                                                <h4 className="font-bold text-slate-900 text-sm whitespace-nowrap">{app.name}</h4>
                                                                                <div className="flex items-center gap-2 mt-0.5">
                                                                                    <code className="text-[10px] text-purple-600 font-mono font-medium">{app._id}</code>
                                                                                    {app.description && <span className="w-1 h-1 bg-slate-300 rounded-full" />}
                                                                                    {app.description && <p className="text-xs text-slate-500 truncate max-w-[300px]">{app.description}</p>}
                                                                                </div>
                                                                            </div>
                                                                        </div>
                                                                        <div className="flex items-center gap-6">
                                                                            <div className="text-right">
                                                                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Devices</p>
                                                                                <p className="text-sm font-bold text-slate-700">{devices[app._id]?.length ?? '...'}</p>
                                                                            </div>
                                                                            <ChevronDown size={18} className={cn("text-slate-300 transition-transform duration-300", devices[app._id] && "rotate-180")} />
                                                                        </div>
                                                                    </div>

                                                                    {/* Device List for App */}
                                                                    {loadingDetails[app._id] && (
                                                                        <div className="px-5 py-8 border-t border-slate-100 flex items-center justify-center gap-3 text-slate-500 bg-slate-50/20">
                                                                            <Loader2 size={16} className="animate-spin" />
                                                                            <span className="text-xs font-medium">Loading devices...</span>
                                                                        </div>
                                                                    )}

                                                                    {devices[app._id] && (
                                                                        <div className="px-5 py-5 bg-slate-50/40 border-t border-slate-100 animate-in fade-in duration-300">
                                                                            {devices[app._id].length === 0 ? (
                                                                                <p className="text-xs text-slate-400 italic text-center py-4">No devices assigned to this application.</p>
                                                                            ) : (
                                                                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                                                                    {devices[app._id].map(device => {
                                                                                        const isDeviceExpanded = expandedDevices.has(device._id);
                                                                                        return (
                                                                                            <div
                                                                                                key={device._id}
                                                                                                className={cn(
                                                                                                    "bg-white border transition-all rounded-xl shadow-sm cursor-pointer hover:shadow-md",
                                                                                                    isDeviceExpanded ? "border-blue-400 ring-4 ring-blue-50 p-4 col-span-full" : "border-slate-200 p-3 hover:border-blue-300"
                                                                                                )}
                                                                                                onClick={() => toggleDevice(device._id)}
                                                                                            >
                                                                                                <div className="flex items-center justify-between">
                                                                                                    <div className="flex items-center gap-3 overflow-hidden">
                                                                                                        <div className={cn(
                                                                                                            "shrink-0 w-2 h-2 rounded-full",
                                                                                                            device.status === 'online' ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" :
                                                                                                                device.status === 'PROVISIONED' ? "bg-blue-500" :
                                                                                                                    device.status === 'offline' ? "bg-red-500" : "bg-slate-300"
                                                                                                        )} />
                                                                                                        <span className="text-sm font-semibold text-slate-800 truncate">{device.name}</span>
                                                                                                    </div>
                                                                                                    <div className="flex items-center gap-2">
                                                                                                        <span className="text-[9px] font-bold text-slate-400 whitespace-nowrap bg-slate-50 px-1.5 py-0.5 rounded border border-slate-100">
                                                                                                            {device.status.toUpperCase()}
                                                                                                        </span>
                                                                                                        <ChevronDown size={14} className={cn("text-slate-300 transition-transform", isDeviceExpanded && "rotate-180")} />
                                                                                                    </div>
                                                                                                </div>

                                                                                                {isDeviceExpanded && (
                                                                                                    <div className="mt-4 pt-3 border-t border-slate-100 space-y-3 animate-in fade-in slide-in-from-top-1">
                                                                                                        <div className="grid grid-cols-2 gap-4">
                                                                                                            <div className="space-y-1">
                                                                                                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Local ID</span>
                                                                                                                <code className="bg-slate-50 px-2 py-1 rounded text-blue-600 font-mono text-[11px] block">{device._id}</code>
                                                                                                            </div>
                                                                                                            <div className="space-y-1">
                                                                                                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Status</span>
                                                                                                                <div className="flex items-center gap-2">
                                                                                                                    <select
                                                                                                                        className="text-xs border border-slate-200 rounded px-2 py-1 bg-white outline-none focus:ring-1 focus:ring-blue-500"
                                                                                                                        value={device.status}
                                                                                                                        onClick={e => e.stopPropagation()}
                                                                                                                        onChange={async e => {
                                                                                                                            e.stopPropagation();
                                                                                                                            try {
                                                                                                                                await fetchWithAuth(`/api/devices/${device._id}`, {
                                                                                                                                    method: 'PUT',
                                                                                                                                    body: JSON.stringify({ status: e.target.value })
                                                                                                                                });
                                                                                                                                // Simple local update
                                                                                                                                setDevices(prev => ({
                                                                                                                                    ...prev,
                                                                                                                                    [app._id]: prev[app._id].map(d => d._id === device._id ? { ...d, status: e.target.value as any } : d)
                                                                                                                                }));
                                                                                                                            } catch (err) { }
                                                                                                                        }}
                                                                                                                    >
                                                                                                                        <option value="PROVISIONED">PROVISIONED</option>
                                                                                                                        <option value="online">ONLINE</option>
                                                                                                                        <option value="offline">OFFLINE</option>
                                                                                                                    </select>
                                                                                                                </div>
                                                                                                            </div>
                                                                                                        </div>
                                                                                                    </div>
                                                                                                )}
                                                                                            </div>
                                                                                        );
                                                                                    })}
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
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {/* Footer Stats */}
            <div className="mt-8 flex items-center justify-between text-slate-500 text-sm">
                <p>Showing {filteredCustomers.length} of {customers.length} total system customers</p>
                <p className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    System Online
                </p>
            </div>

            {/* MODALS */}

            {/* Customer Create/Edit Modal */}
            {showCreateCustomer && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-[100] animate-in fade-in duration-300">
                    <div className="bg-white rounded-[32px] shadow-2xl p-8 w-full max-w-xl animate-in zoom-in-95 duration-200 relative overflow-hidden">
                        <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-blue-500 to-indigo-600" />
                        <button onClick={() => setShowCreateCustomer(false)} className="absolute top-6 right-6 p-2 hover:bg-slate-100 rounded-full text-slate-400 transition-colors">
                            <X size={20} />
                        </button>

                        <div className="mb-8">
                            <h2 className="text-2xl font-bold text-slate-900 mb-1">{editingCustomer ? 'Edit Customer Settings' : 'Register New Customer'}</h2>
                            <p className="text-slate-500 text-sm">Configure organization details and operational limits.</p>
                        </div>

                        <form onSubmit={handleSaveCustomer} className="space-y-6">
                            <div className="space-y-2">
                                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-[0.1em] ml-1">Full Organization Name</label>
                                <input
                                    required
                                    value={customerForm.name}
                                    onChange={e => setCustomerForm(prev => ({ ...prev, name: e.target.value }))}
                                    className="w-full px-5 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-slate-900 focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all"
                                    placeholder="e.g. Global Tech Solutions Inc."
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <label className="text-[11px] font-bold text-slate-400 uppercase tracking-[0.1em] ml-1">Device Access Limit</label>
                                    <input
                                        type="number"
                                        required
                                        value={customerForm.device_limit}
                                        onChange={e => setCustomerForm(prev => ({ ...prev, device_limit: parseInt(e.target.value) }))}
                                        className="w-full px-5 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-slate-900 focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[11px] font-bold text-slate-400 uppercase tracking-[0.1em] ml-1">App Registration Limit</label>
                                    <input
                                        type="number"
                                        required
                                        value={customerForm.app_limit}
                                        onChange={e => setCustomerForm(prev => ({ ...prev, app_limit: parseInt(e.target.value) }))}
                                        className="w-full px-5 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-slate-900 focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all"
                                    />
                                </div>
                            </div>

                            <div className="flex gap-4 pt-4">
                                <button type="button" onClick={() => setShowCreateCustomer(false)} className="flex-1 px-6 py-4 border border-slate-200 rounded-2xl text-sm font-bold text-slate-600 hover:bg-slate-50 transition-all">
                                    Discard Changes
                                </button>
                                <button type="submit" className="flex-1 px-6 py-4 bg-blue-600 text-white rounded-2xl text-sm font-bold shadow-lg shadow-blue-500/20 hover:bg-blue-700 hover:-translate-y-0.5 transition-all">
                                    {editingCustomer ? 'Update Organization' : 'Confirm Registration'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Application Create Modal */}
            {showCreateApp && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-[100] animate-in fade-in">
                    <div className="bg-white rounded-[32px] shadow-2xl p-8 w-full max-w-lg animate-in zoom-in-95 relative">
                        <button onClick={() => setShowCreateApp(null)} className="absolute top-6 right-6 p-2 hover:bg-slate-100 rounded-full text-slate-400 transition-colors">
                            <X size={20} />
                        </button>

                        <div className="mb-6">
                            <h2 className="text-xl font-bold text-slate-900 mb-1">Add New Application</h2>
                            <p className="text-slate-500 text-sm">Register a new firmware or software application for this customer.</p>
                        </div>

                        <form onSubmit={handleCreateApp} className="space-y-4">
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Application Name</label>
                                <input
                                    required
                                    value={appForm.name}
                                    onChange={e => setAppForm(prev => ({ ...prev, name: e.target.value }))}
                                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                                    placeholder="e.g. Robot Control v2"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Description (Optional)</label>
                                <textarea
                                    value={appForm.description}
                                    onChange={e => setAppForm(prev => ({ ...prev, description: e.target.value }))}
                                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none h-24 resize-none"
                                    placeholder="Internal notes or versioning info..."
                                />
                            </div>
                            <div className="flex gap-3 pt-4">
                                <button type="submit" className="w-full py-3.5 bg-blue-600 text-white rounded-xl text-sm font-bold shadow-md hover:bg-blue-700">
                                    Register Application
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* User Create Modal */}
            {showCreateUser && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-[100] animate-in fade-in">
                    <div className="bg-white rounded-[32px] shadow-2xl p-8 w-full max-w-md animate-in zoom-in-95 relative">
                        <button onClick={() => setShowCreateUser(null)} className="absolute top-6 right-6 p-2 hover:bg-slate-100 rounded-full text-slate-400 transition-colors">
                            <X size={20} />
                        </button>

                        <div className="mb-6">
                            <h2 className="text-xl font-bold text-slate-900 mb-1">Create Admin User</h2>
                            <p className="text-slate-500 text-sm">Provide access credentials for this customer profile.</p>
                        </div>

                        <form onSubmit={handleCreateUser} className="space-y-4">
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Email / Username</label>
                                <input
                                    required
                                    value={userForm.email}
                                    onChange={e => setUserForm(prev => ({ ...prev, email: e.target.value }))}
                                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                                    placeholder="user@customer.com"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Access Password</label>
                                <input
                                    required
                                    type="password"
                                    value={userForm.password}
                                    onChange={e => setUserForm(prev => ({ ...prev, password: e.target.value }))}
                                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Access Tier</label>
                                <select
                                    value={userForm.role}
                                    onChange={e => setUserForm(prev => ({ ...prev, role: e.target.value }))}
                                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                                >
                                    <option value="ADMIN">ADMIN (Full Control)</option>
                                    <option value="USER">USER (Restricted Access)</option>
                                </select>
                            </div>
                            <button type="submit" className="w-full py-3.5 bg-blue-600 text-white rounded-xl text-sm font-bold shadow-md hover:bg-blue-700 mt-4 transition-all">
                                Initialize Account
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default SuperAdminAnalytics;
