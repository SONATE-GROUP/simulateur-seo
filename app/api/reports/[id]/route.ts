import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { db, initDb } from '@/lib/turso';

export const runtime = 'nodejs';

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await initDb();
    const result = await db.execute({
      sql: 'SELECT state_b64 FROM reports WHERE id = ?',
      args: [params.id],
    });

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Rapport introuvable' }, { status: 404 });
    }

    return NextResponse.json({ stateB64: result.rows[0][0] });
  } catch (err) {
    console.error('[reports/[id] GET]', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  try {
    await initDb();
    if (!session.user.isGlobalAdmin) {
      const reportRes = await db.execute({
        sql: 'SELECT workspace_id, created_by FROM reports WHERE id = ?',
        args: [params.id],
      });
      if (!reportRes.rows.length) return NextResponse.json({ error: 'Introuvable' }, { status: 404 });
      const workspaceId = reportRes.rows[0][0] as string | null;
      const createdBy   = reportRes.rows[0][1] as string;
      if (createdBy !== session.user.id) {
        if (workspaceId) {
          const check = await db.execute({
            sql: 'SELECT role FROM workspace_members WHERE workspace_id = ? AND user_id = ?',
            args: [workspaceId, session.user.id],
          });
          const role = check.rows[0]?.[0] as string | undefined;
          if (!role || role === 'reader') return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
        } else {
          return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
        }
      }
    }
    await db.execute({ sql: 'DELETE FROM reports WHERE id = ?', args: [params.id] });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[reports/[id] DELETE]', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

/* PATCH /api/reports/[id] — move report to another workspace (admin or source-workspace owner) */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  try {
    await initDb();
    const { workspaceId } = await req.json(); // null = no workspace

    // Fetch current report
    const reportRes = await db.execute({
      sql: 'SELECT workspace_id, created_by FROM reports WHERE id = ?',
      args: [params.id],
    });
    if (!reportRes.rows.length) return NextResponse.json({ error: 'Rapport introuvable' }, { status: 404 });

    const currentWorkspaceId = reportRes.rows[0][0] as string | null;

    if (!session.user.isGlobalAdmin) {
      // Must be owner of the source workspace (or creator with no workspace)
      if (currentWorkspaceId) {
        const check = await db.execute({
          sql: 'SELECT role FROM workspace_members WHERE workspace_id = ? AND user_id = ?',
          args: [currentWorkspaceId, session.user.id],
        });
        const role = check.rows[0]?.[0] as string | undefined;
        if (role !== 'owner') return NextResponse.json({ error: 'Accès refusé — propriétaire requis' }, { status: 403 });
      } else {
        // Report not in any workspace: only creator can move it
        const createdBy = reportRes.rows[0][1] as string;
        if (createdBy !== session.user.id) return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
      }
    }

    await db.execute({
      sql: 'UPDATE reports SET workspace_id = ? WHERE id = ?',
      args: [workspaceId ?? null, params.id],
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[reports/[id] PATCH]', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  try {
    await initDb();
    const { prospect, siteUrl, sector, stateB64 } = await req.json();

    if (!stateB64) {
      return NextResponse.json({ error: 'stateB64 requis' }, { status: 400 });
    }

    // Check access: admin can update anything; members must belong to the report's workspace
    if (!session.user.isGlobalAdmin) {
      const reportRes = await db.execute({
        sql: 'SELECT workspace_id, created_by FROM reports WHERE id = ?',
        args: [params.id],
      });
      if (reportRes.rows.length === 0) {
        return NextResponse.json({ error: 'Rapport introuvable' }, { status: 404 });
      }
      const workspaceId = reportRes.rows[0][0] as string | null;
      const createdBy   = reportRes.rows[0][1] as string;
      if (createdBy !== session.user.id) {
        if (workspaceId) {
          const memberCheck = await db.execute({
            sql: 'SELECT role FROM workspace_members WHERE workspace_id = ? AND user_id = ?',
            args: [workspaceId, session.user.id],
          });
          if (!memberCheck.rows.length) {
            return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
          }
        } else {
          return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
        }
      }
    }

    await db.execute({
      sql: `UPDATE reports
            SET prospect = ?, site_url = ?, sector = ?, state_b64 = ?, created_at = ?
            WHERE id = ?`,
      args: [prospect ?? '', siteUrl ?? '', sector ?? '', stateB64, new Date().toISOString(), params.id],
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[reports/[id] PUT]', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
