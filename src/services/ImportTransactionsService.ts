/* eslint-disable no-undef */
import { getCustomRepository, getRepository, In } from 'typeorm';
import csvParse from 'csv-parse';
import fs from 'fs';

import Transaction from '../models/Transaction';
import Category from '../models/Category';

import TransactionsRepository from '../repositories/TransactionsRepository';

interface CSVTransaction {
  title: string;
  type: 'income' | 'outcome';
  value: number;
  category: string;
}

class ImportTransactionsService {
  async execute(filePath: string): Promise<Transaction[]> {
    const leituraArquivo = fs.createReadStream(filePath);

    const transactionRepository = getCustomRepository(TransactionsRepository);
    const categoryRepository = getRepository(Category);

    const parsers = csvParse({
      from_line: 2,
    });

    const parseCSV = leituraArquivo.pipe(parsers);
    const transactions: CSVTransaction[] = [];
    const categories: string[] = [];

    parseCSV.on('data', async line => {
      // eslint-disable-next-line prettier/prettier
      const [title, type, value, category] = line.map((cell: string) => cell.trim() );

      if (!title || !type || !value) return;

      categories.push(category);
      transactions.push({ title, type, value, category });
    });

    await new Promise(resolve => parseCSV.on('end', resolve));

    const categoriasExistentes = await categoryRepository.find({
      where: { title: In(categories) },
    });

    const tituloCategoriaExistente = categoriasExistentes.map(
      (category: Category) => category.title,
    );

    const tituloCategoriasParaAdicionar = categories
      .filter(category => !tituloCategoriaExistente.includes(category))
      .filter((value, index, self) => self.indexOf(value) === index);

    const categoriasParaInsert = categoryRepository.create(
      tituloCategoriasParaAdicionar.map(title => ({
        title,
      })),
    );

    await categoryRepository.save(categoriasParaInsert);

    const allCategories = [...categoriasParaInsert, ...categoriasExistentes];

    const transacoesParaInsert = transactionRepository.create(
      transactions.map(transaction => ({
        title: transaction.title,
        type: transaction.type,
        value: transaction.value,
        category: allCategories.find(
          category => category.title === transaction.category,
        ),
      })),
    );

    await transactionRepository.save(transacoesParaInsert);

    await fs.promises.unlink(filePath);

    return transacoesParaInsert;
  }
}

export default ImportTransactionsService;
