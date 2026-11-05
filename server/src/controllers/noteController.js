const Note = require('../models/Note');
const Category = require('../models/Category');
const mongoose = require('mongoose');
const ApiError = require('../utils/ApiError');

async function ownedCategoryId(userId, categoryId) {
  if (!categoryId || !mongoose.Types.ObjectId.isValid(categoryId)) {
    throw ApiError.badRequest('Choose a category for this note.');
  }
  const category = await Category.findOne({
    _id: categoryId,
    isArchived: false,
    $or: [{ owner: userId }, { isDefault: true, owner: null }]
  }).select('_id').lean();
  if (!category) throw ApiError.badRequest('Choose a valid category.');
  return category._id;
}

async function listNotes(req, res) {
  const notes = await Note.find({ user: req.user._id })
    .populate('category', 'name color icon type')
    .sort({ pinned: -1, updatedAt: -1 })
    .lean();
  res.json({ notes });
}

async function createNote(req, res) {
  const { title = '', body = '', tag = '', color = 'rose', pinned = false } = req.body;
  if (!String(body).trim()) throw ApiError.badRequest('Write something in your note first.');
  const category = await ownedCategoryId(req.user._id, req.body.category);
  const note = await Note.create({
    user: req.user._id,
    category,
    title: String(title).trim(),
    body: String(body).trim(),
    tag: String(tag).trim(),
    color,
    pinned: Boolean(pinned)
  });
  res.status(201).json({ note });
}

async function updateNote(req, res) {
  const note = await Note.findOne({ _id: req.params.id, user: req.user._id });
  if (!note) throw ApiError.notFound('Note not found.');

  for (const field of ['title', 'body', 'tag', 'color']) {
    if (req.body[field] !== undefined) note[field] = String(req.body[field]).trim();
  }
  if (req.body.category !== undefined) {
    note.category = await ownedCategoryId(req.user._id, req.body.category);
  }
  if (req.body.pinned !== undefined) note.pinned = Boolean(req.body.pinned);
  if (!note.body) throw ApiError.badRequest('Write something in your note first.');
  await note.save();
  await note.populate('category', 'name color icon type');
  res.json({ note });
}

async function deleteNote(req, res) {
  const note = await Note.findOneAndDelete({ _id: req.params.id, user: req.user._id });
  if (!note) throw ApiError.notFound('Note not found.');
  res.json({ message: 'Note deleted.' });
}

module.exports = { listNotes, createNote, updateNote, deleteNote };
