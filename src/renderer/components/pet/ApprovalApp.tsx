import { CheckIcon, ShieldExclamationIcon, XMarkIcon } from '@heroicons/react/24/outline';
import React, { useEffect, useState } from 'react';

import { classifyPetPermission, PetPermissionLevel } from '../../../shared/pet/security';

interface PendingApproval {
  sessionId: string;
  request: {
    requestId: string;
    toolName: string;
    toolInput?: unknown;
    toolUseId?: string | null;
  };
}

const ApprovalApp: React.FC = () => {
  const [approval, setApproval] = useState<PendingApproval | null>(null);

  useEffect(() => {
    return window.electron.cowork.onStreamPermission(({ sessionId, request }) => {
      setApproval({ sessionId, request });
    });
  }, []);

  const respond = async (behavior: 'allow' | 'always_allow' | 'deny') => {
    if (!approval) return;
    await window.electron.cowork.respondToPermission({
      requestId: approval.request.requestId,
      result: behavior === 'allow' || behavior === 'always_allow'
        ? {
            behavior: 'allow',
            toolUseID: approval.request.toolUseId ?? undefined,
          }
        : {
            behavior,
            message: 'User denied this desktop pet action.',
            interrupt: true,
            toolUseID: approval.request.toolUseId ?? undefined,
          },
    });
    setApproval(null);
    await window.electron.pet.closeApprovalWindow();
  };

  const level = approval
    ? classifyPetPermission(approval.request.toolName, approval.request.toolInput)
    : PetPermissionLevel.Direct;

  return (
    <div className="approval-shell">
      <div className="approval-header">
        <ShieldExclamationIcon />
        <div>
          <h1>操作确认</h1>
          <p>{approval ? approval.request.toolName : '暂无待确认操作'}</p>
        </div>
      </div>
      <div className="approval-body">
        <div className="approval-row">
          <span>权限等级</span>
          <strong>{level}</strong>
        </div>
        <div className="approval-row">
          <span>目标会话</span>
          <strong>{approval?.sessionId ?? '-'}</strong>
        </div>
        <pre>{JSON.stringify(approval?.request.toolInput ?? {}, null, 2)}</pre>
      </div>
      <div className="approval-actions">
        <button type="button" onClick={() => { void respond('deny'); }}>
          <XMarkIcon />
          拒绝
        </button>
        <button type="button" className="primary" onClick={() => { void respond('allow'); }}>
          <CheckIcon />
          本次允许
        </button>
        <button type="button" className="primary" onClick={() => { void respond('always_allow'); }}>
          <CheckIcon />
          始终允许
        </button>
      </div>
    </div>
  );
};

export default ApprovalApp;