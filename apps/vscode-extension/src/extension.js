"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const generateTests_1 = require("./commands/generateTests");
function activate(context) {
    console.log("🚀 RTL Test Generator AI activated");
    // Register main command
    const generateCommand = vscode.commands.registerCommand("rtlTestGenerator.generateTests", async (uri) => {
        await (0, generateTests_1.generateTests)(uri);
    });
    // Simple status bar item
    const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBarItem.text = "$(beaker) RTL Ready";
    statusBarItem.tooltip = "RTL Test Generator is ready";
    statusBarItem.show();
    context.subscriptions.push(generateCommand, statusBarItem);
    // Check backend connection
    checkBackendConnection(statusBarItem);
}
async function checkBackendConnection(statusBarItem) {
    try {
        const response = await fetch("http://localhost:7070/health");
        if (response.ok) {
            statusBarItem.text = "$(beaker) RTL Ready";
            statusBarItem.tooltip = "RTL Test Generator is ready";
        }
        else {
            statusBarItem.text = "$(error) RTL Error";
            statusBarItem.tooltip = "Backend not responding";
        }
    }
    catch (error) {
        statusBarItem.text = "$(warning) RTL Offline";
        statusBarItem.tooltip = "Backend offline - make sure to run 'pnpm backend'";
    }
}
function deactivate() {
    console.log("RTL Test Generator AI deactivated");
}
//# sourceMappingURL=extension.js.map