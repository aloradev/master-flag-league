import type { Response } from 'express';
import type { AuthRequest } from '../middleware/auth.js';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';
import { query, withTransaction } from '../config/database.js';
import { newPrefixedId } from '../utils/id.js';
import { slugify } from '../utils/slug.js';
import { generateTokens } from '../utils/jwt.js';

const clean = (value: unknown, max = 255) => typeof value === 'string' ? value.trim().slice(0, max) : '';

export const list = asyncHandler(async (req: AuthRequest, res: Response) => {
  const result = await query(`SELECT l.*,
    (SELECT COUNT(*)::int FROM seasons s WHERE s.league_id=l.id) AS seasons_count,
    (SELECT COUNT(*)::int FROM teams t JOIN seasons s ON s.id=t.season_id WHERE s.league_id=l.id) AS teams_count
    FROM leagues l ORDER BY (l.id=$1) DESC, l.name`, [req.user!.leagueId]);
  res.json({ success:true, data:result.rows });
});

export const create = asyncHandler(async (req: AuthRequest, res: Response) => {
  const name=clean(req.body?.name); const city=clean(req.body?.city,120); const state=clean(req.body?.state,120);
  const seasonName=clean(req.body?.seasonName); const startDate=clean(req.body?.startDate,10);
  const deadline=clean(req.body?.registrationDeadline,10) || null;
  const year=Number(req.body?.year);
  const categories=Array.from(new Map<string,string>((Array.isArray(req.body?.categories)?req.body.categories:[])
    .map((v:unknown)=>clean(v,60)).filter(Boolean).map((v:string)=>[slugify(v),v])).values());
  if (!name || !seasonName || !city || !Number.isInteger(year) || year<2020 || year>2100 ||
      !/^\d{4}-\d{2}-\d{2}$/.test(startDate) || categories.length===0) {
    throw new AppError('Completa liga, ciudad, temporada, año, fecha de inicio y al menos una categoría.',400);
  }
  if (deadline && !/^\d{4}-\d{2}-\d{2}$/.test(deadline)) throw new AppError('Fecha de cierre inválida.',400);
  if (deadline && deadline < startDate) throw new AppError('El cierre de inscripciones no puede ser anterior al inicio.',400);
  const slug=slugify(name); if (!slug) throw new AppError('El nombre de la liga no es válido.',400);
  const data=await withTransaction(async q=>{
    await q('SELECT pg_advisory_xact_lock(hashtext($1))',[`league:${slug}`]);
    if ((await q('SELECT id FROM leagues WHERE slug=$1',[slug])).rows.length) throw new AppError('Ya existe una liga con ese nombre.',409);
    const leagueId=newPrefixedId('league'); const seasonId=newPrefixedId('season');
    await q(`INSERT INTO leagues(id,name,slug,city,state,country,sport,timezone)
      VALUES($1,$2,$3,$4,$5,'México','FLAG_FOOTBALL','America/Cancun')`,[leagueId,name,slug,city,state||null]);
    await q(`INSERT INTO seasons(id,league_id,name,year,start_date,registration_deadline,status)
      VALUES($1,$2,$3,$4,$5,$6,'ACTIVE')`,[seasonId,leagueId,seasonName,year,startDate,deadline]);
    for (let i=0;i<categories.length;i++) await q(`INSERT INTO categories(id,season_id,name,slug,color,sort_order)
      VALUES($1,$2,$3,$4,$5,$6)`,[newPrefixedId('cat'),seasonId,categories[i],slugify(categories[i]),['#2563eb','#db2777','#7c3aed','#0d9488','#ea580c','#65a30d'][i%6],i+1]);
    await q(`INSERT INTO settings(id,league_id,season_id,key,value) VALUES($1,$2,$3,'documents',$4)`,
      [newPrefixedId('set'),leagueId,seasonId,JSON.stringify({required:['PHOTO','ID_FRONT','ID_BACK'],allowed_mime:['image/jpeg','image/png','application/pdf'],max_size_mb:10})]);
    return {id:leagueId,name,seasonId,categories};
  });
  res.status(201).json({success:true,data});
});

export const select = asyncHandler(async (req: AuthRequest, res: Response) => {
  const league=(await query("SELECT id,name FROM leagues WHERE id=$1 AND status='ACTIVE'",[req.params.id])).rows[0];
  if (!league) throw new AppError('Liga no disponible.',404);
  const user=(await query(`UPDATE users SET league_id=$1, session_version=session_version+1, updated_at=NOW()
    WHERE id=$2 RETURNING id,email,name,session_version`,[league.id,req.user!.id])).rows[0];
  const tokens=generateTokens({id:user.id,email:user.email,name:user.name,role:'SUPER_ADMIN',leagueId:league.id,sessionVersion:user.session_version});
  res.json({success:true,data:{...tokens,league}});
});
