import React, { useState } from 'react';
import {
    UserPlus,
    Users,
    ChevronRight,
    ChevronDown,
    LogOut,
    LayoutDashboard,
    RefreshCw,
    Edit2,
    Trash2,
    Loader2,
    Activity,
    CheckCircle,
    AlertCircle,
    Server,
    Shield,
    HardDrive,
    Download,
    Upload,
    Link
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import conqueLogo from "@/assets/conque.png";
import { Html5Qrcode } from 'html5-qrcode';

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
        deviceLimit: 10,
        role: 'ADMIN' as 'ADMIN' | 'USER',
        plants: [
            {
                name: '',
                mqtt_broker: '192.168.0.23',
                mqtt_port: '8883',
                certFiles: { crt: null as File | null, key: null as File | null, srl: null as File | null },
                apps: [
                    {
                        name: '',
                        manual_id: '',
                        devices: [{ name: '', device_id: '', version: '' }]
                    }
                ]
            }
        ]
    });

    const [activeTab, setActiveTab] = useState<'onboarding' | 'users'>('users');
    const [users, setUsers] = useState<any[]>([]);
    const [isLoadingUsers, setIsLoadingUsers] = useState(false);
    const [editingUser, setEditingUser] = useState<any | null>(null);
    const [editForm, setEditForm] = useState({
        email: '',
        password: '',
        deviceLimit: 0,
    });

    // Drill-down State
    const [expandedUser, setExpandedUser] = useState<string | null>(null);
    const [expandedApp, setExpandedApp] = useState<string | null>(null);
    const [userApps, setUserApps] = useState<any[]>([]);
    const [appDevices, setAppDevices] = useState<any[]>([]);
    const [userCerts, setUserCerts] = useState<any[]>([]);
    const [userOrphanDevices, setUserOrphanDevices] = useState<any[]>([]);
    const [isLoadingDrillDown, setIsLoadingDrillDown] = useState(false);

    // UI Refinement States
    const [isProvisioningExpanded, setIsProvisioningExpanded] = useState(false);
    const [addingAppToUser, setAddingAppToUser] = useState<{ userId: string, customerId: string } | null>(null);
    const [newAppForm, setNewAppForm] = useState({
        name: '',
        manual_id: '',
        plant_name: '',
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

    const handleImportPackage = async (e: React.ChangeEvent<HTMLInputElement>, customerId: string) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const formData = new FormData();
        formData.append('file', file);
        formData.append('customer_id', customerId);

        setIsLoadingDrillDown(true);
        try {
            const response = await fetch(`${BASE_URL}/api/admin/provision-from-zip`, {
                method: 'POST',
                body: formData,
                credentials: 'include'
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error);

            alert(`Successfully provisioned device: ${data.details.device_name}`);
            await refreshExpandedCustomerData(customerId);
        } catch (err: any) {
            alert(`Import failed: ${err.message}`);
        } finally {
            setIsLoadingDrillDown(false);
            e.target.value = ''; // Reset input
        }
    };

    const handleAutoFillFromQR = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const html5QrCode = new Html5Qrcode("admin-reader-hidden");
        try {
            const decodedText = await html5QrCode.scanFile(file, true);
            const response = await fetch(`${BASE_URL}/api/admin/decrypt-qr`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ qrData: decodedText })
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error);

            setNewDeviceForm({
                name: data.device_name || '',
                device_id: data.device_id || '',
                version: data.app_version || '1.0'
            });
        } catch (err: any) {
            alert(`Failed to decode QR: ${err.message}`);
        } finally {
            e.target.value = '';
        }
    };


    // Plant Edit State
    const [editingPlant, setEditingPlant] = useState<{
        plantName: string;
        customerId: string;
        certPaths?: any;
        apps: any[];
        mqtt_broker: string;
        mqtt_port: string;
    } | null>(null);
    const [addingPlantToUser, setAddingPlantToUser] = useState<{ userId: string; customerId: string } | null>(null);
    const [newPlantForm, setNewPlantForm] = useState({
        name: '',
        mqtt_broker: '192.168.0.23',
        mqtt_port: '8883',
        certFiles: { crt: null as File | null, key: null as File | null, srl: null as File | null }
    });
    const [userStats, setUserStats] = useState<Record<string, any>>({}); // customerId -> stats

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

        // Validate total device count across all plants
        if (isProvisioningExpanded) {
            const totalDevices = userForm.plants.reduce((sum, plant) =>
                sum + plant.apps.reduce((appSum, app) => appSum + app.devices.filter(d => d.name || d.device_id).length, 0), 0);
            if (totalDevices > userForm.deviceLimit) {
                alert(`Total devices (${totalDevices}) exceeds the device limit (${userForm.deviceLimit}). Please reduce devices or increase the limit.`);
                return;
            }

            for (let i = 0; i < userForm.plants.length; i++) {
                const plant = userForm.plants[i];
                const { crt, key, srl } = plant.certFiles;
                if (!crt || !key || !srl) {
                    const missing = [!crt && '.crt', !key && '.key', !srl && '.srl'].filter(Boolean).join(', ');
                    alert(`Plant "${plant.name || `Plant ${i + 1}`}" is missing required certificate files: ${missing}`);
                    return;
                }
            }
        }

        setIsSubmitting(true);
        try {
            console.log('Starting unified user creation...');

            // Build FormData to include cert files
            const formData = new FormData();

            // Structured JSON data (without File objects)
            const plantsData = userForm.plants.map(p => ({
                name: p.name,
                mqtt_broker: p.mqtt_broker,
                mqtt_port: p.mqtt_port,
                apps: p.apps
            }));
            formData.append('data', JSON.stringify({
                organization: userForm.organization,
                email: userForm.email,
                password: userForm.password,
                device_limit: userForm.deviceLimit,
                role: userForm.role,
                plants: plantsData
            }));

            // Append cert files per plant
            userForm.plants.forEach((plant, idx) => {
                if (plant.certFiles.crt) formData.append(`plant_${idx}_crt`, plant.certFiles.crt);
                if (plant.certFiles.key) formData.append(`plant_${idx}_key`, plant.certFiles.key);
                if (plant.certFiles.srl) formData.append(`plant_${idx}_srl`, plant.certFiles.srl);
            });

            const response = await fetch(`${BASE_URL}/api/admin/onboard`, {
                method: 'POST',
                body: formData,
                credentials: 'include',
            });
            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                throw new Error(errData.error || `Error: ${response.status} ${response.statusText}`);
            }

            alert('User profile and hierarchical configurations created successfully!');
            setUserForm({
                organization: '',
                email: '',
                password: '',
                deviceLimit: 10,
                role: 'ADMIN',
                plants: [{
                    name: '',
                    mqtt_broker: '192.168.0.23',
                    mqtt_port: '8883',
                    certFiles: { crt: null, key: null, srl: null },
                    apps: [{ name: '', manual_id: '', devices: [{ name: '', device_id: '', version: '' }] }]
                }]
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

    const refreshExpandedCustomerData = async (customerId: string) => {
        setIsLoadingDrillDown(true);
        try {
            const [apps, stats, certs, allDevs] = await Promise.all([
                fetchWithAuth(`/api/applications?customer_id=${customerId}`),
                fetchWithAuth(`/api/customers/${customerId}/stats`),
                fetchWithAuth(`/api/admin/certificates?customer_id=${customerId}`),
                fetchWithAuth(`/api/devices?customer_id=${customerId}`)
            ]);
            setUserApps(apps);
            setUserStats(prev => ({ ...prev, [customerId]: stats }));
            setUserCerts(certs || []);
            setUserOrphanDevices(allDevs.filter((d: any) => !d.application_id));

            // Sync the expanded-app device list from the embedded devices already in the apps response
            setAppDevices(prev => {
                if (!expandedApp) return prev;
                const freshApp = (apps as any[]).find((a: any) => a._id === expandedApp);
                return freshApp ? (freshApp.devices || []) : prev;
            });

            // Re-fetch the user list so the top-level device count / usage bar reflects the change
            fetchUsers();
        } catch (err) {
            console.error('Failed to refresh expanded customer data:', err);
        } finally {
            setIsLoadingDrillDown(false);
        }
    };

    React.useEffect(() => {
        if (activeTab === 'users') {
            fetchUsers();
        }
    }, [activeTab]);

    // Keep device usage counts fresh while the admin panel is open.
    React.useEffect(() => {
        if (activeTab !== 'users') return;

        const tick = () => {
            if (document.visibilityState === 'visible') fetchUsers();
        };

        document.addEventListener('visibilitychange', tick);
        const interval = window.setInterval(tick, 5000);
        return () => {
            document.removeEventListener('visibilitychange', tick);
            window.clearInterval(interval);
        };
    }, [activeTab]);

    // If a user is expanded, also keep the drill-down counts fresh.
    React.useEffect(() => {
        if (!expandedUser) return;

        const customerId = sessionStorage.getItem('expandedCustId');
        if (!customerId) return;

        const tick = () => {
            if (document.visibilityState !== 'visible') return;
            if (isLoadingDrillDown) return;
            refreshExpandedCustomerData(customerId);
        };

        document.addEventListener('visibilitychange', tick);
        const interval = window.setInterval(tick, 5000);
        return () => {
            document.removeEventListener('visibilitychange', tick);
            window.clearInterval(interval);
        };
    }, [expandedUser, isLoadingDrillDown]);

    React.useEffect(() => {
        const savedUserId = sessionStorage.getItem('expandedUserId');
        const savedCustId = sessionStorage.getItem('expandedCustId');
        if (savedUserId && savedCustId && users.length > 0 && !expandedUser) {
            const user = users.find(u => u._id === savedUserId);
            if (user) {
                toggleUserExpand(savedUserId, savedCustId);
            }
        }
    }, [users]);

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

    const handleDeletePlant = async (plantName: string, _customerId: string) => {
        if (!confirm(`Are you sure you want to delete the entire plant "${plantName}"? This will remove ALL applications and devices under it.`)) return;
        setIsLoadingDrillDown(true);
        try {
            // Find all apps belonging to this plant
            const appsToDelete = userApps.filter(a => a.plant_name === plantName);
            for (const app of appsToDelete) {
                await fetchWithAuth(`/api/applications/${app._id}`, { method: 'DELETE' });
            }
            setUserApps(prev => prev.filter(a => a.plant_name !== plantName));
            alert(`Plant "${plantName}" and its associated infrastructure have been removed.`);
        } catch (err: any) {
            alert(`Failed to delete plant: ${err.message}`);
        } finally {
            setIsLoadingDrillDown(false);
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
            plant_name: '',
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
                    plant_name: newAppForm.plant_name,
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

    const handleSaveEditPlant = async () => {
        if (!editingPlant) return;
        setIsSubmitting(true);
        try {
            // 1. Handle Cert Re-uploads, Plant Name Change & MQTT Updates
            const selectedFiles = (editingPlant as any).newFiles || {};
            const isNameChanged = editingPlant.plantName !== (editingPlant as any).originalName;

            // To be safe, we'll consider MQTT fields always potentially updated if we're in the edit modal
            const formData = new FormData();
            formData.append('customer_id', editingPlant.customerId);
            formData.append('plant_name', editingPlant.plantName);
            formData.append('mqtt_broker', editingPlant.mqtt_broker);
            formData.append('mqtt_port', editingPlant.mqtt_port);

            if (isNameChanged && (editingPlant as any).originalName) {
                formData.append('old_plant_name', (editingPlant as any).originalName);
            }

            if (selectedFiles.crt) formData.append('crt', selectedFiles.crt);
            if (selectedFiles.key) formData.append('key', selectedFiles.key);
            if (selectedFiles.srl) formData.append('srl', selectedFiles.srl);

            await fetch(`${BASE_URL}/api/admin/update-plant-certs`, {
                method: 'POST',
                body: formData,
                credentials: 'include'
            });

            // 2. Handle Application Updates (Names/Manual IDs within this plant)
            // Note: In this simple version we assume the user might have edited names in the modal apps list
            // For brevity, we'll focus on the plant-level updates first and basic app name sync
            for (const app of editingPlant.apps) {
                if (app._deleted) {
                    if (app._id && !String(app._id).startsWith('new-')) {
                        await fetchWithAuth(`/api/applications/${app._id}`, { method: 'DELETE' });
                    }
                    continue;
                }

                if (app._id && !app._id.startsWith('new-')) {
                    await fetchWithAuth(`/api/applications/${app._id}`, {
                        method: 'PUT',
                        body: JSON.stringify({
                            name: app.name,
                            manual_id: app.manual_id,
                            plant_name: editingPlant.plantName
                        })
                    });
                } else if (app.name?.trim()) {
                    await fetchWithAuth('/api/applications', {
                        method: 'POST',
                        body: JSON.stringify({
                            name: app.name.trim(),
                            manual_id: (app.manual_id || '').trim(),
                            plant_name: editingPlant.plantName,
                            customer_id: editingPlant.customerId
                        })
                    });
                }
            }

            alert("Plant configurations updated successfully!");
            setEditingPlant(null);
            fetchUsers();
            if (expandedUser) toggleUserExpand(expandedUser, editingPlant.customerId);
        } catch (err: any) {
            alert(`Failed to update plant: ${err.message}`);
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
            // Refresh everything (apps, certs, devices) so cascaded cert deletions are reflected
            const customerId = sessionStorage.getItem('expandedCustId');
            if (customerId) await refreshExpandedCustomerData(customerId);
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

    const handleSaveNewPlant = async () => {
        if (!addingPlantToUser || !newPlantForm.name) {
            alert("Plant Name is required.");
            return;
        }

        const { crt, key, srl } = newPlantForm.certFiles;
        if (!crt || !key || !srl) {
            alert("All three certificate files (.crt, .key, .srl) are required.");
            return;
        }

        setIsSubmitting(true);
        try {
            const formData = new FormData();
            formData.append('customer_id', addingPlantToUser.customerId);
            formData.append('plant_name', newPlantForm.name);
            formData.append('mqtt_broker', newPlantForm.mqtt_broker);
            formData.append('mqtt_port', newPlantForm.mqtt_port);
            formData.append('crt', crt);
            formData.append('key', key);
            formData.append('srl', srl);

            const response = await fetch(`${BASE_URL}/api/admin/add-plant`, {
                method: 'POST',
                body: formData,
                credentials: 'include'
            });

            const result = await response.json();
            if (!response.ok) throw new Error(result.error);

            alert("Plant added successfully!");
            setAddingPlantToUser(null);
            setNewPlantForm({
                name: '',
                mqtt_broker: '192.168.0.23',
                mqtt_port: '8883',
                certFiles: { crt: null, key: null, srl: null }
            });

            // Refresh hierarchy
            if (expandedUser) {
                toggleUserExpand(expandedUser, addingPlantToUser.customerId);
            }
        } catch (err: any) {
            alert(`Failed to add plant: ${err.message}`);
        } finally {
            setIsSubmitting(false);
        }
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
            // Refresh everything (devices list, certs) so cascaded cert deletion is reflected immediately
            const customerId = sessionStorage.getItem('expandedCustId');
            if (customerId) {
                await refreshExpandedCustomerData(customerId);
            } else if (expandedApp) {
                // Fallback: at minimum refresh the device list for the open app
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
            sessionStorage.removeItem('expandedUserId');
            sessionStorage.removeItem('expandedCustId');
            setUserApps([]);
            setExpandedApp(null);
            setAppDevices([]);
            setUserCerts([]);
            setUserOrphanDevices([]);
            return;
        }

        setExpandedUser(userId);
        sessionStorage.setItem('expandedUserId', userId);
        sessionStorage.setItem('expandedCustId', customerId);
        await refreshExpandedCustomerData(customerId);
    };

    const handleDownloadCert = async (certId: string, filename: string) => {
        try {
            const response = await fetchWithAuth(`/api/admin/certificates/${certId}/download`);
            if (response.zip_data) {
                const byteCharacters = atob(response.zip_data);
                const byteNumbers = new Array(byteCharacters.length);
                for (let i = 0; i < byteCharacters.length; i++) {
                    byteNumbers[i] = byteCharacters.charCodeAt(i);
                }
                const byteArray = new Uint8Array(byteNumbers);
                const blob = new Blob([byteArray], { type: 'application/zip' });
                const url = window.URL.createObjectURL(blob);

                const a = document.createElement('a');
                a.href = url;
                a.download = filename || 'certificate_package.zip';
                document.body.appendChild(a);
                a.click();
                a.remove();
                window.URL.revokeObjectURL(url);
            }
        } catch (err) {
            alert('Failed to download certificate package.');
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
                        <div className="hidden sm:flex flex-col items-end mr-2">
                            <span className="text-sm font-semibold text-slate-800">{user?.customer_name || 'Administrator'}</span>
                        </div>
                        <div className="bg-slate-100 rounded-full w-10 h-10 flex items-center justify-center text-slate-600 font-bold">
                            {user?.customer_name?.charAt(0) || 'A'}
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
                                            <div className="space-y-2">
                                                <label className="text-sm font-semibold text-slate-700">Device Limit (total across all plants)</label>
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

                                    <div className="space-y-6 pt-6 border-t border-slate-100">
                                        <div className="flex items-center justify-between">
                                            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                                                <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-[10px]">2</div>
                                                Plant Details
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
                                                <p className="text-xs text-slate-400 italic">Optional: Bulk provision plants, applications and devices for this account.</p>
                                            </div>
                                        )}

                                        {isProvisioningExpanded && (
                                            <div className="space-y-8 animate-in slide-in-from-top-4 duration-300">

                                                {userForm.plants.map((plant, plantIdx) => (
                                                    <div key={plantIdx} className="p-8 bg-slate-50 rounded-3xl space-y-6 border border-slate-100 relative group/plant animate-in fade-in slide-in-from-right-4">
                                                        {plantIdx > 0 && (
                                                            <button
                                                                onClick={() => {
                                                                    const newPlants = [...userForm.plants];
                                                                    newPlants.splice(plantIdx, 1);
                                                                    setUserForm(prev => ({ ...prev, plants: newPlants }));
                                                                }}
                                                                className="absolute -top-3 -right-3 w-8 h-8 bg-red-100 text-red-600 rounded-full flex items-center justify-center hover:bg-red-200 transition-colors shadow-md opacity-0 group-hover/plant:opacity-100 z-10"
                                                            >
                                                                ×
                                                            </button>
                                                        )}

                                                        {/* Plant Name */}
                                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                                            <div className="space-y-2 md:col-span-1">
                                                                <label className="text-sm font-bold text-slate-700">Plant Name *</label>
                                                                <input
                                                                    type="text"
                                                                    placeholder="e.g. Main Processing Plant"
                                                                    value={plant.name}
                                                                    onChange={e => {
                                                                        const newPlants = [...userForm.plants];
                                                                        newPlants[plantIdx].name = e.target.value;
                                                                        setUserForm(prev => ({ ...prev, plants: newPlants }));
                                                                    }}
                                                                    className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 text-sm bg-white"
                                                                />
                                                            </div>
                                                            <div className="space-y-2">
                                                                <label className="text-sm font-bold text-slate-700">MQTT Broker</label>
                                                                <input
                                                                    type="text"
                                                                    placeholder="127.0.0.1"
                                                                    value={plant.mqtt_broker}
                                                                    onChange={e => {
                                                                        const newPlants = [...userForm.plants];
                                                                        newPlants[plantIdx].mqtt_broker = e.target.value;
                                                                        setUserForm(prev => ({ ...prev, plants: newPlants }));
                                                                    }}
                                                                    className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 text-sm bg-white"
                                                                />
                                                            </div>
                                                            <div className="space-y-2">
                                                                <label className="text-sm font-bold text-slate-700">MQTT Port</label>
                                                                <input
                                                                    type="text"
                                                                    placeholder="8883"
                                                                    value={plant.mqtt_port}
                                                                    onChange={e => {
                                                                        const newPlants = [...userForm.plants];
                                                                        newPlants[plantIdx].mqtt_port = e.target.value;
                                                                        setUserForm(prev => ({ ...prev, plants: newPlants }));
                                                                    }}
                                                                    className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 text-sm bg-white"
                                                                />
                                                            </div>
                                                        </div>

                                                        {/* Certificate Files */}
                                                        <div className="space-y-3 pt-4 border-t border-slate-200/50">
                                                            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest">Certificate Files</h3>
                                                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                                                {(['crt', 'key', 'srl'] as const).map((ext) => (
                                                                    <div key={ext} className="space-y-1">
                                                                        <label className="text-[10px] font-bold text-slate-400 uppercase">.{ext} File *</label>
                                                                        <div className="relative">
                                                                            <input
                                                                                type="file"
                                                                                accept={`.${ext}`}
                                                                                onChange={e => {
                                                                                    const file = e.target.files?.[0] || null;
                                                                                    const newPlants = [...userForm.plants];
                                                                                    newPlants[plantIdx].certFiles[ext] = file;
                                                                                    setUserForm(prev => ({ ...prev, plants: newPlants }));
                                                                                }}
                                                                                className="w-full text-xs file:mr-2 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-[10px] file:font-bold file:bg-blue-50 file:text-blue-600 hover:file:bg-blue-100 cursor-pointer border border-slate-100 rounded-lg bg-white py-1.5 px-2"
                                                                            />
                                                                        </div>
                                                                        {plant.certFiles[ext] && (
                                                                            <p className="text-[10px] text-emerald-600 font-medium truncate">✓ {plant.certFiles[ext]!.name}</p>
                                                                        )}
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>

                                                        {/* Applications inside this Plant */}
                                                        <div className="space-y-6 pt-4 border-t border-slate-200/50">
                                                            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest">Application Details for {plant.name || `Plant ${plantIdx + 1}`}</h3>

                                                            {plant.apps.map((app, appIdx) => (
                                                                <div key={appIdx} className="p-6 bg-white rounded-2xl space-y-6 border border-slate-100 relative group/app">
                                                                    {appIdx > 0 && (
                                                                        <button
                                                                            onClick={() => {
                                                                                const newPlants = [...userForm.plants];
                                                                                newPlants[plantIdx].apps.splice(appIdx, 1);
                                                                                setUserForm(prev => ({ ...prev, plants: newPlants }));
                                                                            }}
                                                                            className="absolute -top-2 -right-2 w-6 h-6 bg-red-100 text-red-600 rounded-full flex items-center justify-center hover:bg-red-200 transition-colors shadow-sm opacity-0 group-hover/app:opacity-100 z-10 text-xs"
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
                                                                                    const newPlants = [...userForm.plants];
                                                                                    newPlants[plantIdx].apps[appIdx].name = e.target.value;
                                                                                    setUserForm(prev => ({ ...prev, plants: newPlants }));
                                                                                }}
                                                                                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 text-sm bg-slate-50/50"
                                                                            />
                                                                        </div>
                                                                        <div className="space-y-2">
                                                                            <label className="text-sm font-bold text-slate-700">Application ID (Optional)</label>
                                                                            <input
                                                                                type="text"
                                                                                placeholder="Manual ID"
                                                                                value={app.manual_id}
                                                                                onChange={e => {
                                                                                    const newPlants = [...userForm.plants];
                                                                                    newPlants[plantIdx].apps[appIdx].manual_id = e.target.value;
                                                                                    setUserForm(prev => ({ ...prev, plants: newPlants }));
                                                                                }}
                                                                                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 text-sm bg-slate-50/50"
                                                                            />
                                                                        </div>
                                                                    </div>

                                                                    {/* Devices inside this Application */}
                                                                    <div className="space-y-4 pt-4 border-t border-slate-200/50">
                                                                        <div className="flex items-center justify-between">
                                                                            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest">Devices for {app.name || `App ${appIdx + 1}`}</h3>
                                                                        </div>

                                                                        <div className="grid grid-cols-1 gap-4">
                                                                            {app.devices.map((device, devIdx) => (
                                                                                <div key={devIdx} className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-100 relative group/dev">
                                                                                    {devIdx > 0 && (
                                                                                        <button
                                                                                            onClick={() => {
                                                                                                const newPlants = [...userForm.plants];
                                                                                                newPlants[plantIdx].apps[appIdx].devices.splice(devIdx, 1);
                                                                                                setUserForm(prev => ({ ...prev, plants: newPlants }));
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
                                                                                                const newPlants = [...userForm.plants];
                                                                                                newPlants[plantIdx].apps[appIdx].devices[devIdx].name = e.target.value;
                                                                                                setUserForm(prev => ({ ...prev, plants: newPlants }));
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
                                                                                                const newPlants = [...userForm.plants];
                                                                                                newPlants[plantIdx].apps[appIdx].devices[devIdx].device_id = e.target.value;
                                                                                                setUserForm(prev => ({ ...prev, plants: newPlants }));
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
                                                                                                const newPlants = [...userForm.plants];
                                                                                                newPlants[plantIdx].apps[appIdx].devices[devIdx].version = e.target.value;
                                                                                                setUserForm(prev => ({ ...prev, plants: newPlants }));
                                                                                            }}
                                                                                            className="w-full px-3 py-2 rounded-lg border border-slate-100 text-xs focus:ring-1 focus:ring-blue-500"
                                                                                        />
                                                                                    </div>
                                                                                </div>
                                                                            ))}
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => {
                                                                                    const newPlants = [...userForm.plants];
                                                                                    newPlants[plantIdx].apps[appIdx].devices.push({ name: '', device_id: '', version: '' });
                                                                                    setUserForm(prev => ({ ...prev, plants: newPlants }));
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
                                                                onClick={() => {
                                                                    const newPlants = [...userForm.plants];
                                                                    newPlants[plantIdx].apps.push({ name: '', manual_id: '', devices: [{ name: '', device_id: '', version: '' }] });
                                                                    setUserForm(prev => ({ ...prev, plants: newPlants }));
                                                                }}
                                                                className="w-full py-3 rounded-xl border border-dashed border-slate-200 text-slate-400 font-bold text-xs hover:border-blue-300 hover:bg-white hover:text-blue-500 transition-all flex items-center justify-center gap-2"
                                                            >
                                                                + Add Another Application to {plant.name || 'Plant'}
                                                            </button>
                                                        </div>
                                                    </div>
                                                ))}

                                                <button
                                                    type="button"
                                                    onClick={() => setUserForm(prev => ({
                                                        ...prev,
                                                        plants: [...prev.plants, {
                                                            name: '',
                                                            mqtt_broker: '192.168.0.23',
                                                            mqtt_port: '8883',
                                                            certFiles: { crt: null, key: null, srl: null },
                                                            apps: [{ name: '', manual_id: '', devices: [{ name: '', device_id: '', version: '' }] }]
                                                        }]
                                                    }))}
                                                    className="w-full py-4 rounded-2xl border-2 border-dashed border-blue-100 text-blue-400 font-bold text-sm hover:border-blue-400 hover:bg-blue-50/50 transition-all flex items-center justify-center gap-2 group"
                                                >
                                                    <div className="w-6 h-6 rounded-full bg-blue-50 group-hover:bg-blue-100 flex items-center justify-center transition-colors">+</div>
                                                    Add Another Plant
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

                                <div className="space-y-6">
                                    {isLoadingUsers && users.length === 0 ? (
                                        <div className="bg-white rounded-3xl border border-slate-100 shadow-xl p-12 text-center text-slate-400">
                                            <div className="flex flex-col items-center gap-2">
                                                <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                                                Loading users...
                                            </div>
                                        </div>
                                    ) : users.length === 0 ? (
                                        <div className="bg-white rounded-3xl border border-slate-100 shadow-xl p-12 text-center text-slate-400">
                                            No users found. Create your first organization to get started.
                                        </div>
                                    ) : (
                                        users.map((user) => {
                                            const isExpanded = expandedUser === user._id;
                                            const usagePercent = user.device_limit ? Math.round((user.device_count / user.device_limit) * 100) : 0;
                                            const stats = userStats[user.customer_id];

                                            return (
                                                <div key={user._id} className={cn(
                                                    "bg-white rounded-3xl border transition-all duration-300 overflow-hidden",
                                                    isExpanded ? "border-blue-200 shadow-2xl shadow-blue-500/10 ring-1 ring-blue-50/50" : "border-slate-100 shadow-lg hover:shadow-xl hover:border-slate-200"
                                                )}>
                                                    {/* User Header Card */}
                                                    <div
                                                        className={cn(
                                                            "p-6 cursor-pointer flex flex-col md:flex-row items-start md:items-center justify-between gap-6",
                                                            isExpanded ? "bg-blue-50/30" : "hover:bg-slate-50/30"
                                                        )}
                                                        onClick={() => toggleUserExpand(user._id, user.customer_id)}
                                                    >
                                                        <div className="flex items-center gap-4">
                                                            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-blue-500/20 font-bold text-xl">
                                                                {user.email?.[0]?.toUpperCase() || 'U'}
                                                            </div>
                                                            <div className="flex flex-col">
                                                                <h3 className="font-bold text-slate-900 text-lg">{user.email}</h3>
                                                                <div className="flex items-center gap-2 mt-0.5">
                                                                    <span className="text-xs font-semibold text-slate-500">{user.customer_name}</span>
                                                                    <span className="w-1 h-1 rounded-full bg-slate-300"></span>
                                                                    <span className={cn(
                                                                        "px-2 py-0.5 rounded-md text-[10px] font-bold tracking-wider uppercase",
                                                                        user.role === 'ADMIN' ? "bg-indigo-100 text-indigo-700" : "bg-emerald-100 text-emerald-700"
                                                                    )}>
                                                                        {user.role}
                                                                    </span>
                                                                </div>
                                                            </div>
                                                        </div>

                                                        <div className="flex flex-col w-full md:w-64 gap-2">
                                                            <div className="flex items-center justify-between text-xs font-bold">
                                                                <span className="text-slate-500 uppercase tracking-widest">Device Usage</span>
                                                                <span className={cn(
                                                                    usagePercent > 90 ? "text-red-500" : usagePercent > 70 ? "text-amber-500" : "text-blue-600"
                                                                )}>
                                                                    {user.device_count || 0} / {user.device_limit || 10}
                                                                </span>
                                                            </div>
                                                            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                                                                <div
                                                                    className={cn(
                                                                        "h-full transition-all duration-500",
                                                                        usagePercent > 90 ? "bg-red-500" : usagePercent > 70 ? "bg-amber-500" : "bg-blue-500"
                                                                    )}
                                                                    style={{ width: `${Math.min(usagePercent, 100)}%` }}
                                                                />
                                                            </div>
                                                        </div>

                                                        <div className="flex items-center gap-2 self-end md:self-center" onClick={e => e.stopPropagation()}>
                                                            <button
                                                                onClick={() => handleStartEdit(user)}
                                                                className="p-3 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-2xl transition-all"
                                                                title="Edit Profile"
                                                            >
                                                                <Edit2 size={20} />
                                                            </button>
                                                            <button
                                                                onClick={() => handleDeleteUser(user._id)}
                                                                className="p-3 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-2xl transition-all"
                                                                title="Delete User"
                                                            >
                                                                <Trash2 size={20} />
                                                            </button>
                                                            <div className={cn(
                                                                "p-2 rounded-xl transition-transform duration-300",
                                                                isExpanded ? "rotate-180 bg-blue-100 text-blue-600" : "text-slate-400"
                                                            )}>
                                                                <ChevronDown size={20} />
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* Expanded Content */}
                                                    {isExpanded && (
                                                        <div className="border-t border-slate-50 p-6 md:p-8 space-y-6 bg-slate-50/20">
                                                            <div className="flex items-center justify-between">
                                                                <div className="flex items-center gap-3">
                                                                    <div className="p-2 bg-white rounded-xl shadow-sm border border-slate-100">
                                                                        <HardDrive size={18} className="text-slate-400" />
                                                                    </div>
                                                                    <h4 className="text-sm font-bold text-slate-700 uppercase tracking-widest">Plant Hierarchy</h4>
                                                                </div>
                                                                <div className="flex items-center gap-2">
                                                                    <button
                                                                        onClick={() => setAddingPlantToUser({ userId: user._id, customerId: user.customer_id })}
                                                                        className="flex items-center gap-2 px-4 py-2 bg-slate-800 text-white rounded-xl text-xs font-bold hover:bg-slate-900 shadow-lg shadow-slate-900/10 transition-all"
                                                                    >
                                                                        <Shield size={14} />
                                                                        + New Plant
                                                                    </button>
                                                                    <button
                                                                        onClick={() => handleAddApp(user.customer_id)}
                                                                        className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold hover:bg-blue-700 shadow-lg shadow-blue-500/20 transition-all"
                                                                    >
                                                                        + New Application
                                                                    </button>
                                                                    <button
                                                                        onClick={() => document.getElementById(`import-pkg-${user.customer_id}`)?.click()}
                                                                        className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-xl text-xs font-bold hover:bg-purple-700 shadow-lg shadow-purple-500/20 transition-all"
                                                                    >
                                                                        <Upload size={14} />
                                                                        Import Package
                                                                    </button>
                                                                    <input
                                                                        type="file"
                                                                        id={`import-pkg-${user.customer_id}`}
                                                                        className="hidden"
                                                                        accept=".zip"
                                                                        onChange={(e) => handleImportPackage(e, user.customer_id)}
                                                                    />
                                                                </div>
                                                            </div>

                                                            {isLoadingDrillDown && userApps.length === 0 && (!stats?.plant_certs || stats.plant_certs.length === 0) ? (
                                                                <div className="flex items-center justify-center gap-3 py-12 text-slate-400">
                                                                    <RefreshCw size={24} className="animate-spin" />
                                                                    <span className="font-semibold">Syncing platform data...</span>
                                                                </div>
                                                            ) : userApps.length === 0 && (!stats?.plant_certs || stats.plant_certs.length === 0) && userOrphanDevices.length === 0 ? (
                                                                <div className="bg-white rounded-2xl border border-dashed border-slate-200 p-12 text-center text-slate-400 italic">
                                                                    No plants or applications configured yet.
                                                                </div>
                                                            ) : (() => {
                                                                const knownPlants = stats?.plant_certs || [];
                                                                const appsByPlant: Record<string, typeof userApps> = {};
                                                                const orphanPlants = new Set(userOrphanDevices.map((d: any) => d.plant_name).filter(Boolean));

                                                                // Group apps by plant
                                                                userApps.forEach(app => {
                                                                    const pName = app.plant_name || 'Ungrouped';
                                                                    if (!appsByPlant[pName]) appsByPlant[pName] = [];
                                                                    appsByPlant[pName].push(app);
                                                                });

                                                                // Combine known plants from stats and plants that only have orphans
                                                                const allPlantNames = new Set([
                                                                    ...knownPlants.map((pc: any) => pc.plant_name),
                                                                    ...Array.from(orphanPlants)
                                                                ]);

                                                                const plantsToRender = Array.from(allPlantNames).map(pName => {
                                                                    const pc = knownPlants.find((k: any) => k.plant_name === pName);
                                                                    return {
                                                                        name: pName,
                                                                        apps: appsByPlant[pName] || [],
                                                                        certs: pc?.cert_paths || null,
                                                                        mqtt_broker: pc?.mqtt_broker || '192.168.0.23',
                                                                        mqtt_port: String(pc?.mqtt_port || '8883')
                                                                    };
                                                                });

                                                                // Add an "Ungrouped" section if there are apps naturally ungrouped
                                                                const ungroupedApps = userApps.filter(app => !app.plant_name || (!allPlantNames.has(app.plant_name) && app.plant_name !== 'Ungrouped'));

                                                                if (ungroupedApps.length > 0) {
                                                                    plantsToRender.push({
                                                                        name: 'Ungrouped / Heritage',
                                                                        apps: ungroupedApps,
                                                                        certs: null,
                                                                        mqtt_broker: '192.168.0.23',
                                                                        mqtt_port: '8883'
                                                                    });
                                                                }

                                                                if (plantsToRender.length === 0 && userOrphanDevices.length === 0) {
                                                                    return (
                                                                        <div className="bg-white rounded-2xl border border-dashed border-slate-200 p-12 text-center text-slate-400 italic">
                                                                            No plants or applications configured yet.
                                                                        </div>
                                                                    );
                                                                }

                                                                return (
                                                                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                                                        {plantsToRender.map((plant) => {
                                                                            const hasCerts = plant.certs && Object.keys(plant.certs || {}).length === 3;
                                                                            const plantOrphans = userOrphanDevices.filter((d: any) => d.plant_name === plant.name);
                                                                            const plantDeviceCount = plant.apps.reduce((sum, app) => sum + (app.device_count || 0), 0) + plantOrphans.length;

                                                                            return (
                                                                                <div key={plant.name} className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden flex flex-col group/plant shadow-slate-200/50">
                                                                                    <div className="p-4 border-b border-slate-50 bg-slate-50/30 flex items-center justify-between">
                                                                                        <div className="flex items-center gap-3">
                                                                                            <div className={cn(
                                                                                                "w-10 h-10 rounded-xl flex items-center justify-center",
                                                                                                plant.certs ? (hasCerts ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-600") : "bg-slate-50 text-slate-400"
                                                                                            )}>
                                                                                                {!plant.certs ? <HardDrive size={18} /> : hasCerts ? <Shield size={18} /> : <AlertCircle size={18} />}
                                                                                            </div>
                                                                                            <div className="flex flex-col">
                                                                                                <span className="text-sm font-bold text-slate-800">{plant.name}</span>
                                                                                                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                                                                                                    {plant.certs ? (hasCerts ? "Certs Valid" : "Certs Missing") : "No Infrastructure"}
                                                                                                </span>
                                                                                            </div>
                                                                                        </div>
                                                                                        {plant.certs && (
                                                                                            <div className="flex items-center gap-1">
                                                                                                <button
                                                                                                    onClick={() => {
                                                                                                        setEditingPlant({
                                                                                                            plantName: plant.name,
                                                                                                            customerId: user.customer_id,
                                                                                                            certPaths: plant.certs,
                                                                                                            apps: plant.apps,
                                                                                                            mqtt_broker: (plant as any).mqtt_broker,
                                                                                                            mqtt_port: (plant as any).mqtt_port
                                                                                                        });
                                                                                                    }}
                                                                                                    className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all"
                                                                                                    title="Edit Plant"
                                                                                                >
                                                                                                    <Edit2 size={16} />
                                                                                                </button>
                                                                                                <button
                                                                                                    onClick={() => handleDeletePlant(plant.name, user.customer_id)}
                                                                                                    className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all"
                                                                                                    title="Delete Plant"
                                                                                                >
                                                                                                    <Trash2 size={16} />
                                                                                                </button>
                                                                                            </div>
                                                                                        )}
                                                                                    </div>

                                                                                    <div className="p-4 bg-white flex-1 space-y-3">
                                                                                        <div className="flex items-center justify-between text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                                                                                            <span>Applications ({plant.apps.length})</span>
                                                                                            <span className="text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">Total Devices: {plantDeviceCount}</span>
                                                                                        </div>

                                                                                        <div className="space-y-2">
                                                                                            {plant.apps.length === 0 ? (
                                                                                                <div className="py-8 text-center text-[10px] text-slate-300 italic border border-dashed border-slate-100 rounded-xl">
                                                                                                    No applications in this plant.
                                                                                                </div>
                                                                                            ) : (
                                                                                                plant.apps.slice(0, 3).map(app => (
                                                                                                    <div
                                                                                                        key={app._id}
                                                                                                        onClick={() => toggleAppExpand(app._id)}
                                                                                                        className={cn(
                                                                                                            "p-3 rounded-xl border border-slate-50 hover:border-blue-100 hover:bg-blue-50/30 transition-all cursor-pointer flex items-center justify-between group/app-item",
                                                                                                            expandedApp === app._id && "border-blue-100 bg-blue-50/50"
                                                                                                        )}
                                                                                                    >
                                                                                                        <div className="flex items-center gap-3">
                                                                                                            <div className="w-8 h-8 rounded-lg bg-blue-100/50 flex items-center justify-center text-blue-600 group-hover/app-item:bg-blue-600 group-hover/app-item:text-white transition-colors">
                                                                                                                <HardDrive size={14} />
                                                                                                            </div>
                                                                                                            <div className="flex flex-col">
                                                                                                                <span className="text-xs font-bold text-slate-700">{app.name}</span>
                                                                                                                <span className="text-[9px] text-slate-400">{app.manual_id || 'Auto-ID'}</span>
                                                                                                            </div>
                                                                                                        </div>
                                                                                                        <div className="flex items-center gap-2">
                                                                                                            <button
                                                                                                                onClick={(e) => { e.stopPropagation(); handleStartEditApp(app); }}
                                                                                                                className="p-1 text-slate-300 hover:text-blue-600 transition-all opacity-0 group-hover/app-item:opacity-100"
                                                                                                                title="Edit Application"
                                                                                                            >
                                                                                                                <Edit2 size={12} />
                                                                                                            </button>
                                                                                                            <button
                                                                                                                onClick={(e) => { e.stopPropagation(); handleDeleteApp(app._id); }}
                                                                                                                className="p-1 text-slate-300 hover:text-red-600 transition-all opacity-0 group-hover/app-item:opacity-100"
                                                                                                                title="Delete Application"
                                                                                                            >
                                                                                                                <Trash2 size={12} />
                                                                                                            </button>
                                                                                                            <ChevronRight size={14} className={cn("text-slate-300 transition-transform", expandedApp === app._id && "rotate-90 text-blue-500")} />
                                                                                                        </div>
                                                                                                    </div>
                                                                                                ))
                                                                                            )}
                                                                                            {plant.apps.length > 3 && (
                                                                                                <div className="text-[10px] text-center font-bold text-slate-400 py-1">
                                                                                                    + {plant.apps.length - 3} more applications
                                                                                                </div>
                                                                                            )}
                                                                                        </div>

                                                                                        {plantOrphans && plantOrphans.length > 0 && (
                                                                                            <div className="mt-3 p-3 bg-orange-50/50 rounded-xl border border-orange-100/50 shadow-inner">
                                                                                                <div className="flex items-center justify-between mb-2">
                                                                                                    <div className="flex items-center gap-1.5">
                                                                                                        <AlertCircle size={10} className="text-orange-500" />
                                                                                                        <span className="text-[10px] font-bold text-orange-600 uppercase tracking-widest">Unassigned Devices</span>
                                                                                                    </div>
                                                                                                    <span className="text-[9px] font-bold text-orange-700 bg-orange-100 px-1.5 py-0.5 rounded-md">{plantOrphans.length}</span>
                                                                                                </div>
                                                                                                <div className="space-y-1.5">
                                                                                                    {plantOrphans.map((device: any) => (
                                                                                                        <div key={device._id} className="bg-white p-2 rounded-lg border border-orange-100 flex items-center justify-between group/mini-dev">
                                                                                                            <div className="flex flex-col">
                                                                                                                <span className="text-[10px] font-bold text-slate-700">{device.name}</span>
                                                                                                                <span className="text-[8px] text-slate-400 font-mono tracking-tighter">{device.device_id_string}</span>
                                                                                                            </div>
                                                                                                            <div className="flex items-center gap-1 opacity-0 group-hover/mini-dev:opacity-100 transition-opacity">
                                                                                                                <button onClick={(e) => { e.stopPropagation(); handleDeleteDevice(device._id); }} className="p-1 text-slate-300 hover:text-red-500"><Trash2 size={10} /></button>
                                                                                                            </div>
                                                                                                        </div>
                                                                                                    ))}
                                                                                                </div>
                                                                                            </div>
                                                                                        )}

                                                                                    </div>

                                                                                    {/* App Details nested expands */}
                                                                                    {plant.apps.some((a: any) => a._id === expandedApp) && (
                                                                                        <div className="px-4 pb-4 animate-in slide-in-from-top-2">
                                                                                            <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                                                                                                <div className="flex items-center justify-between mb-2">
                                                                                                    <span className="text-[10px] font-bold text-slate-500 uppercase">Device List</span>
                                                                                                    <button onClick={() => handleAddDevice(expandedApp!, user.customer_id)} className="text-[9px] font-bold text-blue-600 hover:underline">+ Add</button>
                                                                                                </div>
                                                                                                {appDevices.length === 0 ? (
                                                                                                    <div className="text-[10px] text-slate-400 italic py-2">No devices.</div>
                                                                                                ) : (
                                                                                                    <div className="space-y-1.5">
                                                                                                        {appDevices.map(device => (
                                                                                                            <div key={device._id} className="bg-white p-2 rounded-lg border border-slate-100 flex items-center justify-between group/mini-dev">
                                                                                                                <div className="flex flex-col">
                                                                                                                    <span className="text-[10px] font-bold text-slate-700">{device.name}</span>
                                                                                                                    <span className="text-[8px] text-slate-400 font-mono tracking-tighter">{device.device_id_string}</span>
                                                                                                                </div>
                                                                                                                <div className="flex items-center gap-1 opacity-0 group-hover/mini-dev:opacity-100 transition-opacity">
                                                                                                                    <button onClick={() => handleStartEditDevice(device)} className="p-1 text-slate-300 hover:text-blue-500"><Edit2 size={10} /></button>
                                                                                                                    <button onClick={() => handleDeleteDevice(device._id)} className="p-1 text-slate-300 hover:text-red-500"><Trash2 size={10} /></button>
                                                                                                                </div>
                                                                                                            </div>
                                                                                                        ))}
                                                                                                    </div>
                                                                                                )}
                                                                                            </div>
                                                                                        </div>
                                                                                    )}
                                                                                </div>
                                                                            );
                                                                        })}
                                                                    </div>
                                                                );
                                                            })()}

                                                            {/* Unassigned / Orphan Devices (Global fallback for older devices missing plant_name) */}
                                                            {(() => {
                                                                const globalOrphans = userOrphanDevices.filter((d: any) => !d.plant_name);
                                                                if (globalOrphans.length === 0) return null;

                                                                return (
                                                                    <div className="p-6 border-t border-slate-100 bg-orange-50/20">
                                                                        <div className="flex items-center justify-between mb-4">
                                                                            <div className="flex items-center gap-2">
                                                                                <div className="w-5 h-5 rounded-full bg-orange-100/50 flex items-center justify-center text-orange-600">
                                                                                    <AlertCircle size={10} />
                                                                                </div>
                                                                                <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Global Unassigned Devices</h4>
                                                                            </div>
                                                                            <span className="text-xs font-bold text-orange-600 bg-orange-100 px-2 py-0.5 rounded-full">{globalOrphans.length} Orphaned</span>
                                                                        </div>
                                                                        <div className="space-y-1.5">
                                                                            {globalOrphans.map((device: any) => (
                                                                                <div key={device._id} className="bg-white p-2.5 rounded-xl border border-orange-100/50 flex items-center justify-between group/mini-dev shadow-sm transition-all hover:shadow-md">
                                                                                    <div className="flex flex-col">
                                                                                        <span className="text-xs font-bold text-slate-700">{device.name}</span>
                                                                                        <span className="text-[9px] text-slate-400 font-mono tracking-tighter">{device.device_id_string}</span>
                                                                                    </div>
                                                                                    <div className="flex items-center gap-1 opacity-0 group-hover/mini-dev:opacity-100 transition-opacity">
                                                                                        <button onClick={() => handleDeleteDevice(device._id)} className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg"><Trash2 size={12} /></button>
                                                                                    </div>
                                                                                </div>
                                                                            ))}
                                                                        </div>
                                                                    </div>
                                                                );
                                                            })()}

                                                            {/* User Certificates */}
                                                            {userCerts && userCerts.length > 0 && (
                                                                <div className="p-6 border-t border-slate-100 bg-slate-50/50">
                                                                    <div className="flex items-center gap-2 mb-4">
                                                                        <div className="w-5 h-5 rounded-full bg-purple-100/50 flex items-center justify-center text-purple-600">
                                                                            <Download size={10} />
                                                                        </div>
                                                                        <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Generated Certificates</h4>
                                                                        <span className="ml-auto text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">{userCerts.length} total</span>
                                                                    </div>
                                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                                        {userCerts.map((cert: any) => {
                                                                            const hasZip = cert.has_zip_data === true;
                                                                            const createdAt = cert.created_at_iso
                                                                                ? new Date(cert.created_at_iso)
                                                                                : cert.created_at
                                                                                    ? new Date(cert.created_at)
                                                                                    : null;
                                                                            const formattedDate = createdAt
                                                                                ? createdAt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
                                                                                : '—';
                                                                            const formattedTime = createdAt
                                                                                ? createdAt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })
                                                                                : '';
                                                                            const isDeviceLinked = Boolean(cert.linked_device_id);
                                                                            return (
                                                                                <div key={cert._id} className={cn(
                                                                                    "bg-white border rounded-xl p-3 flex flex-col gap-2 shadow-sm transition-all",
                                                                                    hasZip ? "border-slate-100 hover:shadow-md" : "border-dashed border-slate-200 opacity-70"
                                                                                )}>
                                                                                    {/* Header row: device name + download button */}
                                                                                    <div className="flex items-start justify-between">
                                                                                        <div className="flex flex-col flex-1 min-w-0">
                                                                                            <span className="text-xs font-bold text-slate-700 truncate">{cert.device_name || 'Unknown Device'}</span>
                                                                                            <span className="text-[9px] text-slate-400 font-mono tracking-wider truncate">{cert.device_id_string || cert.filename}</span>
                                                                                        </div>
                                                                                        <button
                                                                                            onClick={() => hasZip ? handleDownloadCert(cert._id, cert.filename) : alert('This certificate was generated before file storage was enabled. Please re-provision this device to get a downloadable package.')}
                                                                                            className={cn(
                                                                                                "ml-2 p-2 rounded-lg transition-all flex-shrink-0",
                                                                                                hasZip
                                                                                                    ? "text-slate-400 hover:text-purple-600 hover:bg-purple-50 cursor-pointer"
                                                                                                    : "text-slate-200 cursor-not-allowed bg-slate-50"
                                                                                            )}
                                                                                            title={hasZip ? `Download ${cert.filename}` : 'No file stored — re-provision to download'}
                                                                                        >
                                                                                            <Download size={14} />
                                                                                        </button>
                                                                                    </div>

                                                                                    {/* Device DB link indicator */}
                                                                                    <div className={cn(
                                                                                        "flex items-center gap-1.5 px-2 py-1 rounded-lg text-[9px] font-bold uppercase tracking-wider w-fit",
                                                                                        isDeviceLinked
                                                                                            ? "bg-teal-50 text-teal-700"
                                                                                            : "bg-slate-100 text-slate-400"
                                                                                    )}>
                                                                                        <Link size={9} />
                                                                                        {isDeviceLinked
                                                                                            ? `Device Linked · ${cert.linked_device_id!.slice(-6)}`
                                                                                            : 'No device record'}
                                                                                    </div>

                                                                                    {/* Footer row: date + badges */}
                                                                                    <div className="flex items-center justify-between gap-2">
                                                                                        <div className="flex flex-col">
                                                                                            <span className="text-xs font-bold text-slate-600">{formattedDate}</span>
                                                                                            <span className="text-[10px] text-slate-400">{formattedTime}</span>
                                                                                        </div>
                                                                                        <div className="flex items-center gap-1">
                                                                                            {cert.plant_name && (
                                                                                                <span className="text-[8px] font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded-md uppercase tracking-wider">{cert.plant_name}</span>
                                                                                            )}
                                                                                            <span className={cn(
                                                                                                "text-[8px] font-bold px-1.5 py-0.5 rounded-md uppercase tracking-wider",
                                                                                                hasZip ? "text-emerald-700 bg-emerald-50" : "text-orange-600 bg-orange-50"
                                                                                            )}>
                                                                                                {hasZip ? '● Downloadable' : '○ No File'}
                                                                                            </span>
                                                                                        </div>
                                                                                    </div>
                                                                                </div>
                                                                            );
                                                                        })}
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    )
                                                    }
                                                </div>
                                            );
                                        })
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </main >

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
                                <div className="space-y-2">
                                    <label className="text-sm font-semibold text-slate-700">Device Limit (total across all plants)</label>
                                    <input
                                        type="number"
                                        value={editForm.deviceLimit}
                                        onChange={e => setEditForm(prev => ({ ...prev, deviceLimit: parseInt(e.target.value) }))}
                                        className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 text-sm"
                                    />
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
            {
                addingAppToUser && (
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
                                        <label className="text-sm font-bold text-slate-700">Assign to Plant</label>
                                        <select
                                            value={newAppForm.plant_name}
                                            onChange={e => setNewAppForm(prev => ({ ...prev, plant_name: e.target.value }))}
                                            className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 text-sm bg-white font-semibold"
                                        >
                                            <option value="">Select a Plant (Optional)</option>
                                            {userStats[addingAppToUser.customerId]?.plant_certs?.map((pc: any) => (
                                                <option key={pc.plant_name} value={pc.plant_name}>
                                                    {pc.plant_name}
                                                </option>
                                            ))}
                                        </select>
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
                )
            }

            {/* Add Device Modal */}
            {
                addingDeviceToApp && (
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
                                    <div className="flex items-center justify-between">
                                        <label className="text-sm font-semibold text-slate-700">Device Name <span className="text-red-500">*</span></label>
                                        <button
                                            onClick={() => document.getElementById('admin-qr-refill')?.click()}
                                            className="text-[10px] font-bold text-indigo-600 hover:underline flex items-center gap-1"
                                        >
                                            <Upload size={10} /> Auto-fill from QR
                                        </button>
                                        <input
                                            id="admin-qr-refill"
                                            type="file"
                                            className="hidden"
                                            accept="image/*"
                                            onChange={handleAutoFillFromQR}
                                        />
                                    </div>
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
                )
            }

            {/* Edit Plant Modal */}
            {
                editingPlant && (
                    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                        <div className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto animate-in zoom-in-95 duration-200">
                            <div className="p-8 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white z-10">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
                                        <Shield size={24} />
                                    </div>
                                    <div>
                                        <h3 className="text-xl font-bold text-slate-900">Edit Plant Configuration</h3>
                                        <p className="text-sm text-slate-500">Update naming, certificates, and applications for this plant.</p>
                                    </div>
                                </div>
                                <button onClick={() => setEditingPlant(null)} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                                    <LogOut size={20} className="rotate-180" />
                                </button>
                            </div>

                            <div className="p-8 space-y-10">
                                {/* Plant Header Info */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                    <div className="space-y-3">
                                        <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
                                            <Activity size={16} className="text-blue-500" />
                                            Plant Name
                                        </label>
                                        <input
                                            type="text"
                                            value={editingPlant.plantName}
                                            onChange={e => {
                                                const oldName = (editingPlant as any).originalName || editingPlant.plantName;
                                                setEditingPlant({ ...editingPlant, plantName: e.target.value, originalName: oldName } as any);
                                            }}
                                            className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 font-semibold"
                                        />
                                    </div>

                                    <div className="space-y-3">
                                        <label className="text-sm font-bold text-slate-700">MQTT Configuration (Broker & Port)</label>
                                        <div className="grid grid-cols-2 gap-4">
                                            <input
                                                type="text"
                                                value={editingPlant.mqtt_broker}
                                                placeholder="Broker"
                                                onChange={e => setEditingPlant({ ...editingPlant, mqtt_broker: e.target.value })}
                                                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 text-sm"
                                            />
                                            <input
                                                type="text"
                                                value={editingPlant.mqtt_port}
                                                placeholder="Port"
                                                onChange={e => setEditingPlant({ ...editingPlant, mqtt_port: e.target.value })}
                                                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 text-sm"
                                            />
                                        </div>
                                    </div>

                                    <div className="space-y-3 md:col-span-2">
                                        <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
                                            <Server size={16} className="text-blue-500" />
                                            Infrastructure Status
                                        </label>
                                        <div className="px-4 py-3 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-between">
                                            <span className="text-sm font-medium text-slate-600">Applications found:</span>
                                            <span className="text-sm font-bold text-blue-600 bg-blue-100 px-2 py-0.5 rounded-lg">{editingPlant.apps.length}</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Certificate Section */}
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between">
                                        <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Certificate Management</h4>
                                        <div className="flex items-center gap-2">
                                            <CheckCircle size={12} className="text-emerald-500" />
                                            <span className="text-[10px] font-bold text-emerald-600">Cloud Sync Active</span>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                        {['crt', 'key', 'srl'].map(ext => {
                                            const hasFile = editingPlant.certPaths?.[ext];
                                            return (
                                                <div key={ext} className="p-4 bg-white rounded-2xl border border-slate-100 shadow-sm space-y-3 relative group/cert">
                                                    <div className="flex items-center justify-between">
                                                        <span className="text-xs font-bold text-slate-500 uppercase">{ext} File</span>
                                                        {hasFile ? (
                                                            <CheckCircle size={16} className="text-emerald-500" />
                                                        ) : (
                                                            <AlertCircle size={16} className="text-amber-500" />
                                                        )}
                                                    </div>
                                                    <div className="text-[10px] text-slate-400 font-medium truncate">
                                                        {hasFile ? "ca." + ext : "No file uploaded yet"}
                                                    </div>
                                                    <input
                                                        type="file"
                                                        id={`edit-cert-${ext}`}
                                                        className="hidden"
                                                        accept={`.${ext}`}
                                                        onChange={e => {
                                                            const file = e.target.files?.[0];
                                                            if (file) {
                                                                const currentFiles = (editingPlant as any).newFiles || {};
                                                                setEditingPlant({ ...editingPlant, newFiles: { ...currentFiles, [ext]: file } } as any);
                                                            }
                                                        }}
                                                    />
                                                    <label
                                                        htmlFor={`edit-cert-${ext}`}
                                                        className="w-full py-2 bg-slate-50 text-slate-600 rounded-lg text-[10px] font-bold border border-slate-100 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-100 transition-all cursor-pointer flex items-center justify-center gap-2"
                                                    >
                                                        {(editingPlant as any).newFiles?.[ext] ? "File Selected" : "Replace File"}
                                                    </label>
                                                    {(editingPlant as any).newFiles?.[ext] && (
                                                        <div className="absolute -top-1 -right-1 w-3 h-3 bg-blue-500 rounded-full border-2 border-white shadow-sm"></div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* Applications List */}
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between">
                                        <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Associated Applications</h4>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                const nextApps = [
                                                    ...editingPlant.apps,
                                                    {
                                                        _id: `new-${Date.now()}`,
                                                        name: '',
                                                        manual_id: '',
                                                        plant_name: editingPlant.plantName
                                                    }
                                                ];
                                                setEditingPlant({ ...editingPlant, apps: nextApps });
                                            }}
                                            className="text-[10px] font-bold text-blue-600 bg-blue-50 px-3 py-1.5 rounded-xl hover:bg-blue-100 transition-all"
                                        >
                                            + New App
                                        </button>
                                    </div>

                                    <div className="space-y-3">
                                        {editingPlant.apps.filter(app => !app._deleted).map((app, appIdx) => (
                                            <div key={app._id || appIdx} className="p-5 bg-slate-50/50 rounded-2xl border border-slate-100 space-y-4">
                                                <div className="flex items-center gap-4">
                                                    <div className="flex-1 space-y-1">
                                                        <label className="text-[10px] font-bold text-slate-400 uppercase">App Name</label>
                                                        <input
                                                            type="text"
                                                            value={app.name}
                                                            onChange={e => {
                                                                const newApps = [...editingPlant.apps];
                                                                newApps[appIdx] = { ...app, name: e.target.value };
                                                                setEditingPlant({ ...editingPlant, apps: newApps });
                                                            }}
                                                            className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm font-semibold focus:ring-1 focus:ring-blue-500"
                                                        />
                                                    </div>
                                                    <div className="flex-1 space-y-1">
                                                        <label className="text-[10px] font-bold text-slate-400 uppercase">App ID</label>
                                                        <input
                                                            type="text"
                                                            value={app.manual_id || ''}
                                                            onChange={e => {
                                                                const newApps = [...editingPlant.apps];
                                                                newApps[appIdx] = { ...app, manual_id: e.target.value };
                                                                setEditingPlant({ ...editingPlant, apps: newApps });
                                                            }}
                                                            className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm font-semibold focus:ring-1 focus:ring-blue-500"
                                                        />
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            const nextApps = editingPlant.apps.map((candidate) =>
                                                                candidate._id === app._id ? { ...candidate, _deleted: true } : candidate
                                                            );
                                                            setEditingPlant({ ...editingPlant, apps: nextApps });
                                                        }}
                                                        className="self-end p-2 text-slate-300 hover:text-red-500 transition-colors"
                                                    >
                                                        <Trash2 size={16} />
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                        {editingPlant.apps.filter(app => !app._deleted).length === 0 && (
                                            <div className="py-8 text-center text-sm text-slate-400 italic bg-slate-50 rounded-2xl border border-slate-100">
                                                No applications configured for this plant.
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div className="p-8 border-t border-slate-100 bg-slate-50 sticky bottom-0 z-10 flex gap-4">
                                <button
                                    onClick={() => setEditingPlant(null)}
                                    className="flex-1 px-6 py-3 rounded-xl border border-slate-200 font-bold text-slate-600 hover:bg-white transition-all"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleSaveEditPlant}
                                    disabled={isSubmitting}
                                    className={cn(
                                        "flex-[2] px-6 py-3 rounded-xl bg-blue-600 text-white font-bold shadow-lg shadow-blue-500/30 hover:bg-blue-700 transition-all flex items-center justify-center gap-2",
                                        isSubmitting && "opacity-70 cursor-not-allowed"
                                    )}
                                >
                                    {isSubmitting ? <RefreshCw size={20} className="animate-spin" /> : "Save Plant Settings"}
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }
            {/* Edit Application Modal */}
            {
                editingApp && (
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
                )
            }

            {/* Edit Device Modal */}
            {
                editingDevice && (
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
                )
            }
            {/* Add Plant Modal */}
            {
                addingPlantToUser && (
                    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                        <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg animate-in zoom-in-95 duration-200">
                            <div className="p-8 border-b border-slate-100 flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
                                        <Shield size={24} />
                                    </div>
                                    <div>
                                        <h3 className="text-xl font-bold text-slate-900">Add New Plant</h3>
                                        <p className="text-sm text-slate-500">Configure new infrastructure for this organization.</p>
                                    </div>
                                </div>
                                <button onClick={() => setAddingPlantToUser(null)} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                                    <LogOut size={20} className="rotate-180" />
                                </button>
                            </div>

                            <div className="p-8 space-y-6">
                                <div className="space-y-2">
                                    <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
                                        <Activity size={16} className="text-blue-500" />
                                        Plant Name
                                    </label>
                                    <input
                                        type="text"
                                        placeholder="e.g. Frankfurt Data Center"
                                        value={newPlantForm.name}
                                        onChange={e => setNewPlantForm({ ...newPlantForm, name: e.target.value })}
                                        className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 font-semibold mb-4"
                                    />
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <label className="text-sm font-bold text-slate-700">MQTT Broker</label>
                                        <input
                                            type="text"
                                            placeholder="127.0.0.1"
                                            value={newPlantForm.mqtt_broker}
                                            onChange={e => setNewPlantForm({ ...newPlantForm, mqtt_broker: e.target.value })}
                                            className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 text-sm"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-sm font-bold text-slate-700">MQTT Port</label>
                                        <input
                                            type="text"
                                            placeholder="8883"
                                            value={newPlantForm.mqtt_port}
                                            onChange={e => setNewPlantForm({ ...newPlantForm, mqtt_port: e.target.value })}
                                            className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 text-sm"
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-4 pt-4 border-t border-slate-50">
                                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Initial Certificates</h4>
                                <div className="grid grid-cols-1 gap-4">
                                    {['crt', 'key', 'srl'].map((ext) => (
                                        <div key={ext} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100">
                                            <div className="flex flex-col">
                                                <span className="text-xs font-bold text-slate-600 uppercase">.{ext} File</span>
                                                <span className="text-[10px] text-slate-400">
                                                    {(newPlantForm.certFiles as any)[ext]?.name || "Not selected"}
                                                </span>
                                            </div>
                                            <input
                                                type="file"
                                                id={`new-plant-${ext}`}
                                                className="hidden"
                                                accept={`.${ext}`}
                                                onChange={e => {
                                                    const file = e.target.files?.[0];
                                                    if (file) {
                                                        setNewPlantForm({
                                                            ...newPlantForm,
                                                            certFiles: { ...newPlantForm.certFiles, [ext]: file }
                                                        });
                                                    }
                                                }}
                                            />
                                            <label
                                                htmlFor={`new-plant-${ext}`}
                                                className="px-4 py-2 bg-white border border-slate-200 rounded-lg text-xs font-bold text-blue-600 hover:bg-blue-50 transition-all cursor-pointer"
                                            >
                                                Choose File
                                            </label>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div className="p-8 border-t border-slate-100 bg-slate-50 flex gap-4 rounded-b-3xl">
                            <button
                                onClick={() => setAddingPlantToUser(null)}
                                className="flex-1 px-6 py-3 rounded-xl border border-slate-200 font-bold text-slate-600 hover:bg-white transition-all"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSaveNewPlant}
                                disabled={isSubmitting}
                                className={cn(
                                    "flex-[2] px-6 py-3 rounded-xl bg-blue-600 text-white font-bold shadow-lg shadow-blue-500/30 hover:bg-blue-700 transition-all flex items-center justify-center gap-2",
                                    isSubmitting && "opacity-70 cursor-not-allowed"
                                )}
                            >
                                {isSubmitting ? <RefreshCw size={20} className="animate-spin" /> : "Create Plant"}
                            </button>
                        </div>
                    </div>
                )
            }
            {/* Hidden reader for scanning */}
            <div id="admin-reader-hidden" className="hidden"></div>
        </div>
    );
};

export default AdminDashboard;
